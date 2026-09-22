// payment 支付模块
// wechat.go 微信支付 V3 渠道适配器（Native 扫码 / 查单 / 关单 / 回调解密验签）
// mock 与真实的差异只在回来的那份报文，解析与校验逻辑完全共用
package payment

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// 微信支付 V3 接口路径，同时作为 mock 报文的分派键
const (
	wechatPathNative = "/pay/transactions/native"
	wechatPathJSAPI  = "/pay/transactions/jsapi"
	wechatPathH5     = "/pay/transactions/h5"
	wechatPathQuery  = "/pay/transactions/out-trade-no/"
	wechatPathClose  = "/close"
)

// wechatH5Scene H5 下单的场景信息，type 固定 WAP，app_url 必须是已报备的域名
const wechatH5SceneType = "WAP"

// wechatProvider 微信支付商户平台
type wechatProvider struct{}

func (w *wechatProvider) Name() string { return "wechat" }

// Prepay Native 下单，真实响应取 code_url，前端拿去生成二维码
func (w *wechatProvider) Prepay(ctx context.Context, payment *Payment) (*PrepayResult, error) {
	fen, err := amountFen(payment.Amount)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]interface{}{
		"appid":        Channels.Wechat.AppID,
		"mchid":        Channels.Wechat.MchID,
		"description":  fmt.Sprintf("FreshMart %s", payment.OrderNo),
		"out_trade_no": payment.ID,
		"notify_url":   Channels.Wechat.NotifyURL,
		"amount": map[string]interface{}{
			"total":    fen,
			"currency": firstNonEmpty(payment.Currency, "CNY"),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	raw, err := w.send(ctx, http.MethodPost, wechatPathNative, body, mockWechatBody(wechatPathNative, payment))
	if err != nil {
		return nil, err
	}
	var res struct {
		CodeURL string `json:"code_url"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, fmt.Errorf("微信响应解析失败")
	}
	if res.CodeURL == "" {
		return nil, fmt.Errorf("微信未返回支付二维码")
	}
	return &PrepayResult{PayURL: res.CodeURL, QRContent: res.CodeURL}, nil
}

// Query 按商户订单号查单，回调未到达时的兜底
func (w *wechatProvider) Query(ctx context.Context, payment *Payment) (*NotifyResult, error) {
	path := wechatPathQuery + payment.ID + "?mchid=" + Channels.Wechat.MchID
	raw, err := w.send(ctx, http.MethodGet, path, nil, mockWechatBody(wechatPathQuery, payment))
	if err != nil {
		return nil, err
	}
	return parseWechatTrade(raw, payment.ID)
}

// Close 超时关单
func (w *wechatProvider) Close(ctx context.Context, payment *Payment) error {
	body, err := json.Marshal(map[string]interface{}{"mchid": Channels.Wechat.MchID})
	if err != nil {
		return fmt.Errorf("支付参数构造失败")
	}
	_, err = w.send(ctx, http.MethodPost, wechatPathQuery+payment.ID+wechatPathClose, body, mockWechatBody(wechatPathClose, payment))
	return err
}

// Launch 按端环境选产品：微信内置浏览器走 JSAPI，手机浏览器走 H5，桌面端用 Prepay 拿到的 Native 二维码
func (w *wechatProvider) Launch(ctx context.Context, payment *Payment, env LaunchEnv) (*Launch, error) {
	if UseMock() {
		return mockLaunch(payment, env), nil
	}
	switch {
	case IsWechatBrowser(env.UserAgent):
		if env.OpenID == "" {
			return nil, fmt.Errorf("微信内支付需要先授权取得 openid")
		}
		return w.launchJSAPI(ctx, payment, env.OpenID)
	case IsMobile(env.UserAgent):
		return w.launchH5(ctx, payment)
	default:
		if payment.QRContent == "" {
			return nil, fmt.Errorf("支付二维码已失效，请重新发起支付")
		}
		return &Launch{
			Kind:      LaunchQrCode,
			PaymentID: payment.ID,
			Provider:  w.Name(),
			QRContent: payment.QRContent,
		}, nil
	}
}

// launchH5 H5 下单拿 h5_url，前端整页跳过去即可拉起微信
func (w *wechatProvider) launchH5(ctx context.Context, payment *Payment) (*Launch, error) {
	fen, err := amountFen(payment.Amount)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]interface{}{
		"appid":        Channels.Wechat.AppID,
		"mchid":        Channels.Wechat.MchID,
		"description":  fmt.Sprintf("FreshMart %s", payment.OrderNo),
		"out_trade_no": payment.ID,
		"notify_url":   Channels.Wechat.NotifyURL,
		"amount":       map[string]interface{}{"total": fen, "currency": firstNonEmpty(payment.Currency, "CNY")},
		"scene_info": map[string]interface{}{
			"h5": map[string]interface{}{"type": wechatH5SceneType},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	raw, err := w.send(ctx, http.MethodPost, wechatPathH5, body, mockWechatBody(wechatPathH5, payment))
	if err != nil {
		return nil, err
	}
	var res struct {
		H5URL string `json:"h5_url"`
	}
	if err := json.Unmarshal(raw, &res); err != nil || res.H5URL == "" {
		return nil, fmt.Errorf("微信未返回 H5 支付链接")
	}
	return &Launch{
		Kind:      LaunchRedirect,
		PaymentID: payment.ID,
		Provider:  w.Name(),
		URL:       res.H5URL,
	}, nil
}

// launchJSAPI 微信内置浏览器下单，拿到 prepay_id 后再签一次名交给 WeixinJSBridge
// 这是唯一会填 PrepayID 的场景，签名串与请求头签名不同，不能复用 wechatAuthorization
func (w *wechatProvider) launchJSAPI(ctx context.Context, payment *Payment, openID string) (*Launch, error) {
	fen, err := amountFen(payment.Amount)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]interface{}{
		"appid":        Channels.Wechat.AppID,
		"mchid":        Channels.Wechat.MchID,
		"description":  fmt.Sprintf("FreshMart %s", payment.OrderNo),
		"out_trade_no": payment.ID,
		"notify_url":   Channels.Wechat.NotifyURL,
		"amount":       map[string]interface{}{"total": fen, "currency": firstNonEmpty(payment.Currency, "CNY")},
		"payer":        map[string]interface{}{"openid": openID},
	})
	if err != nil {
		return nil, fmt.Errorf("支付参数构造失败")
	}
	raw, err := w.send(ctx, http.MethodPost, wechatPathJSAPI, body, mockWechatBody(wechatPathJSAPI, payment))
	if err != nil {
		return nil, err
	}
	var res struct {
		PrepayID string `json:"prepay_id"`
	}
	if err := json.Unmarshal(raw, &res); err != nil || res.PrepayID == "" {
		return nil, fmt.Errorf("微信未返回预下单号")
	}
	payment.PrepayID = res.PrepayID
	sign, err := wechatJSAPISign(res.PrepayID)
	if err != nil {
		return nil, err
	}
	return &Launch{
		Kind:      LaunchJSAPI,
		PaymentID: payment.ID,
		Provider:  w.Name(),
		JSAPI:     sign,
	}, nil
}

// wechatJSAPISign 前端唤起第二段签名：appId\ntimeStamp\nnonceStr\nprepay_id\n
func wechatJSAPISign(prepayID string) (*JSAPILaunch, error) {
	key, err := parseRSAPrivateKey(Channels.Wechat.PrivateKey)
	if err != nil {
		return nil, err
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := nonce()
	sign, err := rsa256Sign(key, fmt.Sprintf("%s\n%s\n%s\n%s\n", Channels.Wechat.AppID, timestamp, nonce, prepayID))
	if err != nil {
		return nil, err
	}
	return &JSAPILaunch{
		AppID:     Channels.Wechat.AppID,
		TimeStamp: timestamp,
		NonceStr:  nonce,
		Package:   "prepay_id=" + prepayID,
		SignType:  "RSA",
		PaySign:   sign,
	}, nil
}

// send 拼 V3 认证头并外呼；mock 时跳过签名与外呼，直接回灌同结构假报文
func (w *wechatProvider) send(ctx context.Context, method, path string, body, mockBody []byte) ([]byte, error) {
	if UseMock() {
		return mockBody, nil
	}
	endpoint := Channels.Wechat.Gateway + path
	auth, err := wechatAuthorization(method, signPathOf(endpoint), body)
	if err != nil {
		return nil, err
	}
	header := http.Header{}
	header.Set("Authorization", auth)
	header.Set("Accept", "application/json")
	header.Set("User-Agent", "go-gin-freshmart/1.0")
	if body != nil {
		header.Set("Content-Type", "application/json")
	}
	return doRequest(ctx, method, endpoint, header, body)
}

// signPathOf 取待签的 URL 路径：微信要求含 query 且带网关自身的 basePath，不能自己拼 /v3
func signPathOf(endpoint string) string {
	u, err := url.Parse(endpoint)
	if err != nil {
		return endpoint
	}
	if u.RawQuery == "" {
		return u.Path
	}
	return u.Path + "?" + u.RawQuery
}

// wechatAuthorization 生成 WECHATPAY2-SHA256-RSA2048 认证头
// 待签串是 method\nurl\ntimestamp\nnonce\nbody\n，url 为 signPathOf 的结果
func wechatAuthorization(method, urlPath string, body []byte) (string, error) {
	key, err := parseRSAPrivateKey(Channels.Wechat.PrivateKey)
	if err != nil {
		return "", err
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	n := nonce()
	content := fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n", method, urlPath, timestamp, n, string(body))
	sign, err := rsa256Sign(key, content)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%s",serial_no="%s"`,
		Channels.Wechat.MchID, n, sign, timestamp, Channels.Wechat.SerialNo), nil
}

// ParseNotify 微信回调：时间戳防重放 → 平台证书验签 → APIv3 Key 解密 resource
// 三个环节任一不过都失败，绝不采信明文之外的任何字段
func (w *wechatProvider) ParseNotify(req *http.Request) (*NotifyResult, error) {
	if UseMock() {
		return nil, fmt.Errorf("模拟渠道不支持公网回调")
	}
	raw, err := readNotifyBody(req)
	if err != nil {
		return nil, err
	}
	timestamp := req.Header.Get("Wechatpay-Timestamp")
	skew, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || absInt64(time.Now().Unix()-skew) > int64(notifyMaxSkew/time.Second) {
		return nil, fmt.Errorf("回调时间戳异常")
	}
	pub, err := parseRSAPublicKey(Channels.Wechat.PlatformCert)
	if err != nil {
		return nil, err
	}
	content := fmt.Sprintf("%s\n%s\n%s\n", timestamp, req.Header.Get("Wechatpay-Nonce"), string(raw))
	if !rsa256Verify(pub, content, req.Header.Get("Wechatpay-Signature")) {
		return nil, fmt.Errorf("回调验签失败")
	}
	var envelope struct {
		EventType string `json:"event_type"`
		Resource  struct {
			AssociatedData string `json:"associated_data"`
			Nonce          string `json:"nonce"`
			Ciphertext     string `json:"ciphertext"`
		} `json:"resource"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("回调报文解析失败")
	}
	if envelope.EventType != "TRANSACTION.SUCCESS" && envelope.EventType != "TRANSACTION.ABNORMAL" && envelope.EventType != "" {
		return nil, fmt.Errorf("不支持的回调事件")
	}
	plain, err := wechatDecryptResource(Channels.Wechat.APIv3Key, envelope.Resource.Nonce, envelope.Resource.AssociatedData, envelope.Resource.Ciphertext)
	if err != nil {
		return nil, err
	}
	return parseWechatTrade(plain, "")
}

// wechatDecryptResource AEAD_AES_256_GCM 解密回调正文，密钥就是 32 字节 APIv3 Key
func wechatDecryptResource(apiv3Key, nonceStr, associatedData, ciphertext string) ([]byte, error) {
	key := []byte(apiv3Key)
	if len(key) != 32 {
		return nil, fmt.Errorf("APIv3 密钥长度必须为 32 字节")
	}
	sealed, err := decodeBase64(ciphertext)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("回调解密初始化失败")
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("回调解密初始化失败")
	}
	plain, err := gcm.Open(nil, []byte(nonceStr), sealed, []byte(associatedData))
	if err != nil {
		return nil, fmt.Errorf("回调解密失败")
	}
	return plain, nil
}

// parseWechatTrade 解析查单/解密后的交易报文，金额按分回落到字符串十进制
// outTradeNo 非空时用于核对查单结果归属
func parseWechatTrade(raw []byte, outTradeNo string) (*NotifyResult, error) {
	var trade struct {
		OutTradeNo    string `json:"out_trade_no"`
		TransactionID string `json:"transaction_id"`
		TradeState    string `json:"trade_state"`
		SuccessTime   string `json:"success_time"`
		Amount        struct {
			Total      int64  `json:"total"`
			PayerTotal int64  `json:"payer_total"`
			Currency   string `json:"currency"`
		} `json:"amount"`
	}
	if err := json.Unmarshal(raw, &trade); err != nil {
		return nil, fmt.Errorf("微信报文解析失败")
	}
	if trade.OutTradeNo == "" {
		return nil, fmt.Errorf("微信报文缺少 out_trade_no")
	}
	if outTradeNo != "" && trade.OutTradeNo != outTradeNo {
		return nil, fmt.Errorf("微信查单结果不匹配")
	}
	amount := trade.Amount.Total
	if trade.Amount.PayerTotal > 0 {
		amount = trade.Amount.PayerTotal
	}
	switch trade.TradeState {
	case "SUCCESS", "REFUND":
		return &NotifyResult{Provider: "wechat", OutTradeNo: trade.OutTradeNo, TradeNo: trade.TransactionID, Amount: fenToAmount(amount), Paid: true, State: trade.TradeState, PaidAt: trade.SuccessTime}, nil
	case "CLOSED", "PAYERROR", "REVOKED":
		return &NotifyResult{Provider: "wechat", OutTradeNo: trade.OutTradeNo, TradeNo: trade.TransactionID, Amount: fenToAmount(amount), Paid: false, State: trade.TradeState}, nil
	default:
		return nil, fmt.Errorf("交易状态未确定")
	}
}

// readNotifyBody 读取回调原文，验签与解密都用它，因此不能提前丢弃
func readNotifyBody(req *http.Request) ([]byte, error) {
	if req.Body == nil {
		return nil, fmt.Errorf("回调报文为空")
	}
	defer req.Body.Close()
	raw, err := ioutil.ReadAll(io.LimitReader(req.Body, responseLimit))
	if err != nil || len(raw) == 0 {
		return nil, fmt.Errorf("回调报文读取失败")
	}
	return raw, nil
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
