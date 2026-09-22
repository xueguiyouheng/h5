// payment 支付模块
// settings.go 渠道参数与开关：环境变量注入，缺省值全是刻意拼出来的假值（含 MOCK 字样）
// 密钥只从环境变量进，不落库、不写日志、不出现在任何接口响应里
package payment

import (
	"os"
	"strconv"
	"time"
)

// Switch 支付渠道开关: mock / alipay / wechat
var Switch = env("PAY_PROVIDER", "mock")

// Expire 支付单有效期，超时后读取时惰性置 closed
var Expire = time.Duration(envInt("PAY_EXPIRE_MINUTES", 15)) * time.Minute

// AlipayParams 支付宝接入参数
type AlipayParams struct {
	AppID      string // 开放平台应用 ID
	PrivateKey string // 应用私钥，RSA2 签名用
	PublicKey  string // 支付宝公钥，回调验签用
	Gateway    string // 网关地址，沙箱与正式不同
	NotifyURL  string // 异步回调，必须公网 HTTPS 可达
	ReturnURL  string // 同步跳转，仅用于展示，不作为支付依据
}

// WechatParams 微信支付接入参数
type WechatParams struct {
	AppID        string // 公众号/小程序/开放平台 appid，需与商户号关联
	MchID        string // 商户号
	APIv3Key     string // APIv3 密钥，回调解密用，32 字节
	SerialNo     string // 商户 API 证书序列号
	PrivateKey   string // 商户私钥，请求签名用
	PlatformCert string // 平台证书，回调验签用
	Gateway      string // 下单域名
	NotifyURL    string // 异步回调
}

// MockParams 模拟渠道专属参数，真实渠道下不参与任何逻辑
type MockParams struct {
	LaunchURL string // 自托管的唤起落点，浏览器整页跳过去，它结算后再跳回来
	ResultURL string // 回跳的前端支付结果页
}

// Channels 渠道参数集合，未注入环境变量时全部为 mock 假值
var Channels = struct {
	Alipay AlipayParams
	Wechat WechatParams
	Mock   MockParams
}{
	Alipay: AlipayParams{
		AppID:      env("ALIPAY_APP_ID", "2021000000MOCK0001"),
		PrivateKey: env("ALIPAY_PRIVATE_KEY", "MOCK-ALIPAY-APP-PRIVATE-KEY"),
		PublicKey:  env("ALIPAY_PUBLIC_KEY", "MOCK-ALIPAY-PUBLIC-KEY"),
		Gateway:    env("ALIPAY_GATEWAY", "https://openapi-sandbox.dl.alipaydev.com/gateway.do"),
		NotifyURL:  env("ALIPAY_NOTIFY_URL", "http://localhost:8080/api/payment/notify/alipay"),
		ReturnURL:  env("ALIPAY_RETURN_URL", "http://localhost:5173/orders"),
	},
	Wechat: WechatParams{
		AppID:        env("WECHAT_APP_ID", "wxmock000000000001"),
		MchID:        env("WECHAT_MCH_ID", "1900000101"),
		APIv3Key:     env("WECHAT_APIV3_KEY", "MOCK-WXPAY-APIV3-KEY-32BYTES-XXXX"),
		SerialNo:     env("WECHAT_MCH_SERIAL_NO", "MOCKSERIAL0000000000000000000001"),
		PrivateKey:   env("WECHAT_MCH_PRIVATE_KEY", "MOCK-WECHAT-MCH-PRIVATE-KEY"),
		PlatformCert: env("WECHAT_PAY_PLATFORM_CERT", "MOCK-WECHATPAY-PLATFORM-CERT"),
		Gateway:      env("WECHAT_GATEWAY", "https://api.mchpay.mock/v3"),
		NotifyURL:    env("WECHAT_NOTIFY_URL", "http://localhost:8080/api/payment/notify/wechat"),
	},
	Mock: MockParams{
		// 唤起走同源相对路径，前端代理与正式域名下都不用改
		LaunchURL: env("PAY_MOCK_LAUNCH_URL", "/api/payment/mock/launch"),
		ResultURL: env("PAY_MOCK_RESULT_URL", "http://localhost:5173/payment/result"),
	},
}

// UseMock 标记是否走模拟渠道，真实渠道接入后只改环境变量，接口层与前端流程都不动
func UseMock() bool {
	return Switch != "alipay" && Switch != "wechat"
}

// Credential 回显给模拟收银台的商户标识，用于确认配置注入生效
// 真实渠道下恒为空串，任何密钥都不允许通过接口外泄
func Credential(provider string) string {
	if !UseMock() {
		return ""
	}
	switch provider {
	case "alipay":
		return "alipay app_id=" + Channels.Alipay.AppID
	case "wechat":
		return "wechat mchid=" + Channels.Wechat.MchID
	}
	return ""
}

// env 读取环境变量，空值按缺省处理
func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envInt 读取整数环境变量
func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
