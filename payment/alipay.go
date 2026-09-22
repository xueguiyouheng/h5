// payment 支付模块
// alipay.go 支付宝开放平台适配器（当面付 precreate / 查单 / 关单 / 异步回调验签）
// mock 与真实的差异只在回来的那份报文，解析与校验逻辑完全共用
package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// 支付宝开放平台接口名，同时决定网关响应的外层节点名
const (
	alipayMethodPrecreate = "alipay.trade.precreate"
	alipayMethodQuery     = "alipay.trade.query"
	alipayMethodClose     = "alipay.trade.close"
	// alipayMethodWapPay 手机网站支付，签名后以自提交表单交给浏览器，不需要服务端外呼
	alipayMethodWapPay = "alipay.trade.wap.pay"
)

// alipayProductWap 手机网站支付的产品码
const alipayProductWap = "QUICK_WAP_WAY"

// alipayCodeSuccess 支付宝业务成功的网关码
const alipayCodeSuccess = "10000"

// alipayPaidStatuses 代表已收款的交易状态
var alipayPaidStatuses = map[string]bool{"TRADE_SUCCESS": true, "TRADE_FINISHED": true}

// alipayProvider 支付宝开放平台
type alipayProvider struct{}

func (a *alipayProvider) Name() string { return "alipay" }

// Prepay 当面付预下单，真实响应取 alipay_trade_precreate_response.qr_code
func (a *alipayProvider) Prepay(ctx context.Context, payment *Payment) (*PrepayResult, error) {
	biz, err := json.Marshal(map[string]interface{}{
		"out_trade_no": payment.ID,
		"total_amount": payment.Amount,
		"subject":      fmt.Sprintf("FreshMart %s", payment.OrderNo),
		"product_code": "FACE_TO_FACE_PAYMENT",
	})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	resp, err := a.call(ctx, alipayMethodPrecreate, string(biz), payment)
	if err != nil {
		return nil, err
	}
	if resp.QRCode == "" {
		return nil, fmt.Errorf("支付宝未返回二维码")
	}
	return &PrepayResult{PayURL: resp.QRCode, QRContent: resp.QRCode}, nil
}

// Query 按 out_trade_no 主动查单，回调未到达时的兜底
func (a *alipayProvider) Query(ctx context.Context, payment *Payment) (*NotifyResult, error) {
	biz, err := json.Marshal(map[string]interface{}{"out_trade_no": payment.ID})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	resp, err := a.call(ctx, alipayMethodQuery, string(biz), payment)
	if err != nil {
		return nil, err
	}
	if resp.OutTradeNo != payment.ID {
		return nil, fmt.Errorf("支付宝查单结果不匹配")
	}
	if !alipayPaidStatuses[resp.TradeStatus] && resp.TradeStatus != "TRADE_CLOSED" {
		return nil, fmt.Errorf("交易状态未确定")
	}
	return &NotifyResult{
		Provider:   a.Name(),
		OutTradeNo: resp.OutTradeNo,
		TradeNo:    resp.TradeNo,
		Amount:     normalizePrice(resp.TotalAmount),
		Paid:       alipayPaidStatuses[resp.TradeStatus],
		State:      resp.TradeStatus,
		PaidAt:     resp.GmtPayment,
	}, nil
}

// Close 超时关单
func (a *alipayProvider) Close(ctx context.Context, payment *Payment) error {
	biz, err := json.Marshal(map[string]interface{}{"out_trade_no": payment.ID})
	if err != nil {
		return fmt.Errorf("支付参数构造失败")
	}
	_, err = a.call(ctx, alipayMethodClose, string(biz), payment)
	return err
}

// Launch 手机网站支付：签名后的公共参数交给浏览器自提交到网关，收银台在支付宝侧
// 桌面端同样能用（支付宝自己的页面会出扫码），因此这里不按 UA 分支
func (a *alipayProvider) Launch(_ context.Context, payment *Payment, env LaunchEnv) (*Launch, error) {
	if UseMock() {
		return mockLaunch(payment, env), nil
	}
	biz, err := json.Marshal(map[string]interface{}{
		"out_trade_no": payment.ID,
		"total_amount": payment.Amount,
		"subject":      fmt.Sprintf("FreshMart %s", payment.OrderNo),
		"product_code": alipayProductWap,
	})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	params := a.publicParams(alipayMethodWapPay, string(biz))
	key, err := parseRSAPrivateKey(Channels.Alipay.PrivateKey)
	if err != nil {
		return nil, err
	}
	sign, err := rsa256Sign(key, sortedQuery(params))
	if err != nil {
		return nil, err
	}
	params["sign"] = sign
	return &Launch{
		Kind:      LaunchForm,
		PaymentID: payment.ID,
		Provider:  a.Name(),
		Action:    Channels.Alipay.Gateway,
		Fields:    params,
	}, nil
}

// publicParams 网关公共参数，异步回调与同步跳转都带上，缺一份渠道就不认
func (a *alipayProvider) publicParams(method, bizContent string) map[string]string {
	return map[string]string{
		"app_id":      Channels.Alipay.AppID,
		"method":      method,
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  Channels.Alipay.NotifyURL,
		"return_url":  Channels.Alipay.ReturnURL,
		"biz_content": bizContent,
	}
}

// call 拼公共参数、RSA2 签名并 POST 到网关
// mock 时跳过签名与外呼，直接回灌同结构假报文，后续解析校验一字不差地照跑
func (a *alipayProvider) call(ctx context.Context, method, bizContent string, payment *Payment) (*alipayResponse, error) {
	params := a.publicParams(method, bizContent)
	raw := mockAlipayBody(method, payment)
	if !UseMock() {
		key, err := parseRSAPrivateKey(Channels.Alipay.PrivateKey)
		if err != nil {
			return nil, err
		}
		sign, err := rsa256Sign(key, sortedQuery(params))
		if err != nil {
			return nil, err
		}
		params["sign"] = sign
		header := http.Header{}
		header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
		form := url.Values{}
		for k, v := range params {
			form.Set(k, v)
		}
		var err2 error
		raw, err2 = doRequest(ctx, http.MethodPost, Channels.Alipay.Gateway, header, []byte(form.Encode()))
		if err2 != nil {
			return nil, err2
		}
	}
	envelope := &alipayEnvelope{}
	if err := json.Unmarshal(raw, envelope); err != nil {
		return nil, fmt.Errorf("支付宝响应解析失败")
	}
	resp := envelope.node(method)
	if resp == nil {
		return nil, fmt.Errorf("支付宝响应缺少业务节点")
	}
	if resp.Code != alipayCodeSuccess {
		return nil, fmt.Errorf("支付宝返回异常")
	}
	return resp, nil
}

// ParseNotify 解析并校验支付宝异步回调
// mock 模式没有真实密钥，公网回调一律拒绝，本地联调走 protected 组的 mock-notify
func (a *alipayProvider) ParseNotify(req *http.Request) (*NotifyResult, error) {
	if UseMock() {
		return nil, fmt.Errorf("模拟渠道不支持公网回调")
	}
	if err := req.ParseForm(); err != nil {
		return nil, fmt.Errorf("回调报文解析失败")
	}
	params := make(map[string]string, len(req.PostForm))
	for k, values := range req.PostForm {
		if len(values) > 0 {
			params[k] = values[0]
		}
	}
	if params["out_trade_no"] == "" {
		return nil, fmt.Errorf("回调缺少 out_trade_no")
	}
	if params["app_id"] != Channels.Alipay.AppID {
		return nil, fmt.Errorf("回调 app_id 不匹配")
	}
	pub, err := parseRSAPublicKey(Channels.Alipay.PublicKey)
	if err != nil {
		return nil, err
	}
	if !rsa256Verify(pub, sortedQuery(params), params["sign"]) {
		return nil, fmt.Errorf("回调验签失败")
	}
	status := params["trade_status"]
	if !alipayPaidStatuses[status] && status != "TRADE_CLOSED" {
		return nil, fmt.Errorf("交易状态未确定")
	}
	return &NotifyResult{
		Provider:   a.Name(),
		OutTradeNo: params["out_trade_no"],
		TradeNo:    params["trade_no"],
		Amount:     normalizePrice(params["total_amount"]),
		Paid:       alipayPaidStatuses[status],
		State:      status,
		PaidAt:     params["gmt_payment"],
	}, nil
}

// alipayResponse 各交易接口共用的业务字段集合
type alipayResponse struct {
	Code        string `json:"code"`
	Msg         string `json:"msg"`
	SubCode     string `json:"sub_code"`
	SubMsg      string `json:"sub_msg"`
	OutTradeNo  string `json:"out_trade_no"`
	TradeNo     string `json:"trade_no"`
	TotalAmount string `json:"total_amount"`
	TradeStatus string `json:"trade_status"`
	GmtPayment  string `json:"gmt_payment"`
	QRCode      string `json:"qr_code"`
}

// alipayEnvelope 网关外层，每个接口有自己的 <method 下划线>_response 节点
type alipayEnvelope struct {
	Precreate *alipayResponse `json:"alipay_trade_precreate_response"`
	Query     *alipayResponse `json:"alipay_trade_query_response"`
	Close     *alipayResponse `json:"alipay_trade_close_response"`
	Sign      string          `json:"sign"`
}

// node 按接口名取业务节点
func (e *alipayEnvelope) node(method string) *alipayResponse {
	switch method {
	case alipayMethodQuery:
		return e.Query
	case alipayMethodClose:
		return e.Close
	default:
		return e.Precreate
	}
}
