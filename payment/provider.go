// payment 支付模块
// provider.go 支付渠道适配层契约 + mock 报文
//
// mock 的边界只有一处：渠道「回来的那份响应体」换成同结构的假报文（见本文件底部 mockXxxBody 系列），
// 拼请求、签名、解析、金额复核、结算全部走真实那一段代码。
// 拿到正式商户信息后只需注入环境变量并把 PAY_PROVIDER 改为 alipay/wechat，调用方与前端流程都不用改。
package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// PrepayResult 渠道预下单响应解析后的落库字段
// 支付宝 precreate 回 qr_code、微信 native 回 code_url，两者都不回预下单号，
// 因此 PayURL 与 QRContent 同源，PrepayID 仅在 JSAPI/wap 这类真有 prepay_id 的场景下非空
type PrepayResult struct {
	PrepayID  string
	PayURL    string
	QRContent string
}

// NotifyResult 渠道异步回调或主动查询归一后的结算依据
// 只允许由验签/解密通过的报文填充；金额一律取渠道回传的字符串，交由结算层与本地快照严格比对
type NotifyResult struct {
	Provider   string
	OutTradeNo string
	TradeNo    string
	Amount     string
	Paid       bool
	State      string
	PaidAt     string
}

// Provider 支付渠道适配器，实现见 alipay.go / wechat.go
type Provider interface {
	Name() string
	// Prepay 建渠道预下单，返回收银台素材
	Prepay(ctx context.Context, payment *Payment) (*PrepayResult, error)
	// ParseNotify 验签并解析公网回调，失败必须返回 error，绝不能返回半可信结果
	ParseNotify(req *http.Request) (*NotifyResult, error)
	// Query 按 out_trade_no 主动查单，回调丢失时的兜底
	Query(ctx context.Context, payment *Payment) (*NotifyResult, error)
	// Close 关单，超时未付时调用
	Close(ctx context.Context, payment *Payment) error
	// Launch 把用户送去付款的唤起指令，按端环境（UA / openid）在渠道内部选产品
	Launch(ctx context.Context, payment *Payment, env LaunchEnv) (*Launch, error)
}

// providers 渠道注册表，键与订单允许的支付方式白名单一致
var providers = map[string]Provider{
	"alipay": &alipayProvider{},
	"wechat": &wechatProvider{},
}

// providerFor 按渠道名取适配器
func providerFor(name string) (Provider, bool) {
	p, ok := providers[name]
	return p, ok
}

//
// ---------- mock 报文：结构与真实网关一致，只有数据是假的 ----------
//

// mockAlipayBody 按接口拼一份支付宝网关响应
// code=10000/msg=Success 与真实一致，qr_code 沿用历史上的假域名与 MOCK 标记，肉眼可辨
func mockAlipayBody(method string, payment *Payment) []byte {
	payload := map[string]interface{}{
		"code": "10000",
		"msg":  "Success",
	}
	switch method {
	case alipayMethodPrecreate:
		payload["out_trade_no"] = payment.ID
		payload["total_amount"] = payment.Amount
		payload["qr_code"] = fmt.Sprintf("https://qr.mock.alipay.com/bax%s?ut=%s&ta=%s", shortID(payment.ID), payment.ID, payment.Amount)
	case alipayMethodQuery:
		payload["out_trade_no"] = payment.ID
		payload["trade_no"] = mockTradeNo(payment.Provider, payment.ID)
		payload["trade_status"] = "TRADE_SUCCESS"
		payload["total_amount"] = payment.Amount
	case alipayMethodClose:
		payload["out_trade_no"] = payment.ID
		payload["trade_no"] = mockTradeNo(payment.Provider, payment.ID)
	}
	return mockEnvelope(map[string]interface{}{
		mockResponseKey(method): payload,
		"sign":                  "MOCK-SIGNATURE",
	})
}

// mockWechatBody 按接口拼一份微信支付 v3 响应
// native 下单真实只回 code_url；查单回 transaction_id/trade_state/amount，金额单位分
func mockWechatBody(endpoint string, payment *Payment) []byte {
	fen, err := amountFen(payment.Amount)
	if err != nil {
		fen = 1
	}
	switch endpoint {
	case wechatPathNative:
		return mockEnvelope(map[string]interface{}{
			"code_url": fmt.Sprintf("weixin://wxpay/bizpayurl?pr=MOCK%s", shortID(payment.ID)),
		})
	case wechatPathH5:
		return mockEnvelope(map[string]interface{}{
			"h5_url": fmt.Sprintf("https://wxtenpay.mock/wechatpay/h5?pr=MOCK%s", shortID(payment.ID)),
		})
	case wechatPathJSAPI:
		return mockEnvelope(map[string]interface{}{
			"prepay_id": fmt.Sprintf("MockWxPrepayID%s", shortID(payment.ID)),
		})
	case wechatPathClose:
		return mockEnvelope(map[string]interface{}{})
	}
	return mockEnvelope(map[string]interface{}{
		"out_trade_no":   payment.ID,
		"transaction_id": mockTradeNo(payment.Provider, payment.ID),
		"trade_state":    "SUCCESS",
		"amount":         map[string]interface{}{"total": fen, "currency": "CNY"},
		"success_time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// mockEnvelope 假报文的 JSON 出口，失败即缺陷，这里回空对象兜底
func mockEnvelope(fields map[string]interface{}) []byte {
	raw, err := json.Marshal(fields)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

// mockResponseKey 支付宝响应外层键是 <method 小写下划线>_response
func mockResponseKey(method string) string {
	return strings.ReplaceAll(method, ".", "_") + "_response"
}

// shortID 取 ObjectID 前 10 位拼假标识
func shortID(id string) string {
	if len(id) < 10 {
		return id
	}
	return id[:10]
}

// mockTradeNo 渠道流水号，前缀标明是模拟数据，便于日志与对账时一眼识别
func mockTradeNo(provider, paymentID string) string {
	prefix := "MOCKALI"
	if provider == "wechat" {
		prefix = "MOCKWX"
	}
	return prefix + paymentID
}
