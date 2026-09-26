// payment 支付模块
// launch.go 唤起契约：把「各渠道怎么把用户送去付款」的差异收敛成前端可枚举的几种形态
//
// 前端只按 kind 分支执行，不拼任何渠道参数；换端（H5 / 小程序 / App）只是换一种 kind 的组合。
// mock 下浏览器端回 redirect，指向本模块自托管的 /api/payment/mock/launch，
// 让「跳出去再跳回来」这段骨架与真实渠道一致，前端不必为模拟渠道单开分支；
// 小程序回不了整页跳转，同一笔换回 qrcode 的「挂起等轮询」语义。
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
	Client       string // 发起端，取自 X-Client 头；小程序的 UA 不可依赖，选产品只能按端标识
	UserAgent    string // 浏览器 UA，微信内置浏览器要改走 JSAPI
	OpenID       string // 微信付款人标识，服务端按会员档案解析，绝不取客户端传参
	AlipayUserID string // 支付宝付款人标识，同上
	MockOutcome  string // 仅模拟渠道使用：success / failed，真实渠道下不参与任何判断
}

// 发起端标识，取自 X-Client 头
// 换端时「用哪个产品收款」是渠道侧的硬约束（小程序 JSAPI 的 appid 必须与 openid 同源），
// 不能靠 UA 嗅探——小程序请求的 UA 五花八门，误判会回一个跳不出去的 redirect
const (
	ClientH5       = "h5"
	ClientMPWechat = "mp_wechat"
	ClientMPAlipay = "mp_alipay"
	ClientApp      = "app"
)

// providerAllowedForClient 该发起端能否用这个渠道收款
// 小程序的 appid 与 openid 同源于自家平台，在微信小程序里建支付宝单到了唤起步骤必然失败，
// 与其留下一笔付不掉的 pending 单，不如建单时就拒；h5 与 app 两个渠道都放行
func providerAllowedForClient(client, provider string) bool {
	switch client {
	case ClientMPWechat:
		return provider == "wechat"
	case ClientMPAlipay:
		return provider == "alipay"
	default:
		return true
	}
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
//
// 小程序没有整页跳转，302 回结果页这条路走不通，因此回 qrcode 形态带上同一个落点：
// 客户端据此识别「已挂起」，展示模拟确认后调既有的 mock-notify，再轮询 query 收敛
func mockLaunch(payment *Payment, env LaunchEnv) *Launch {
	query := url.Values{}
	query.Set("payment_id", payment.ID)
	if env.MockOutcome == "failed" {
		query.Set("outcome", "failed")
	}
	link := Channels.Mock.LaunchURL + "?" + query.Encode()
	if env.Client == ClientMPWechat || env.Client == ClientMPAlipay {
		return &Launch{
			Kind:      LaunchQrCode,
			PaymentID: payment.ID,
			Provider:  payment.Provider,
			QRContent: link,
		}
	}
	return &Launch{
		Kind:      LaunchRedirect,
		PaymentID: payment.ID,
		Provider:  payment.Provider,
		URL:       link,
	}
}
