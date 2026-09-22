// payment 支付模块
// launch.go 唤起契约：把「各渠道怎么把用户送去付款」的差异收敛成前端可枚举的几种形态
//
// 前端只按 kind 分支执行，不拼任何渠道参数；换端（H5 / 小程序 / App）只是换一种 kind 的组合。
// mock 下所有渠道都回 redirect，指向本模块自托管的 /api/payment/mock/launch，
// 让「跳出去再跳回来」这段骨架与真实渠道一致，前端不必为模拟渠道单开分支。
package payment

import (
	"net/url"
	"strings"
)

// 唤起形态
const (
	// LaunchForm 自提交表单：支付宝手机网站支付，前端把已签名字段填进 form 提交到渠道网关
	LaunchForm = "form"
	// LaunchRedirect 整页跳转：微信 H5 的 h5_url、模拟渠道的回跳
	LaunchRedirect = "redirect"
	// LaunchJSAPI 微信内置浏览器：参数含第二段签名，前端交 WeixinJSBridge
	LaunchJSAPI = "jsapi"
	// LaunchQrCode 桌面端兜底：展示二维码由用户手机扫码
	LaunchQrCode = "qrcode"
)

// LaunchEnv 唤起时的运行环境，由 HTTP 层从请求里取，渠道据此选产品
type LaunchEnv struct {
	UserAgent   string // 浏览器 UA，微信内置浏览器要改走 JSAPI
	OpenID      string // 公众号/小程序内的用户标识，JSAPI 必需；没接授权时为空
	MockOutcome string // 仅模拟渠道使用：success / failed，真实渠道下不参与任何判断
}

// JSAPILaunch 微信 JSAPI 唤起参数，Package 固定为 prepay_id=xxx
type JSAPILaunch struct {
	AppID     string `json:"appId"`
	TimeStamp string `json:"timeStamp"`
	NonceStr  string `json:"nonceStr"`
	Package   string `json:"package"`
	SignType  string `json:"signType"`
	PaySign   string `json:"paySign"`
}

// Launch 一次唤起指令，只带当前 kind 用得上的字段
type Launch struct {
	Kind      string `json:"kind"`
	PaymentID string `json:"payment_id"`
	Provider  string `json:"provider"`
	// kind=form
	Action string            `json:"action,omitempty"`
	Fields map[string]string `json:"fields,omitempty"`
	// kind=redirect
	URL string `json:"url,omitempty"`
	// kind=jsapi
	JSAPI *JSAPILaunch `json:"jsapi,omitempty"`
	// kind=qrcode
	QRContent string `json:"qr_content,omitempty"`
}

// mobileUAKeywords 移动浏览器特征，微信 UA 也在其中
var mobileUAKeywords = []string{"android", "iphone", "ipod", "ipad", "micromessenger", "openharmony"}

// IsWechatBrowser 微信内置浏览器，H5 与 JSAPI 的分水岭
func IsWechatBrowser(ua string) bool {
	return strings.Contains(strings.ToLower(ua), "micromessenger")
}

// IsMobile 移动端浏览器；桌面端要回落到扫码
func IsMobile(ua string) bool {
	lower := strings.ToLower(ua)
	for _, k := range mobileUAKeywords {
		if strings.Contains(lower, k) {
			return true
		}
	}
	return false
}

// mockLaunch 模拟渠道的唤起：跳自托管端点，由它结算后 302 回结果页
// outcome 只决定假报文里的收款结果，状态机与真实渠道一字不差
func mockLaunch(payment *Payment, env LaunchEnv) *Launch {
	query := url.Values{}
	query.Set("payment_id", payment.ID)
	if env.MockOutcome == "failed" {
		query.Set("outcome", "failed")
	}
	return &Launch{
		Kind:      LaunchRedirect,
		PaymentID: payment.ID,
		Provider:  payment.Provider,
		URL:       Channels.Mock.LaunchURL + "?" + query.Encode(),
	}
}
