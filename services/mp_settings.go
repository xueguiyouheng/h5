// services 业务逻辑层
// mp_settings.go 小程序身份换取参数：appid、密钥与开放接口网关
// 口径与 payment/settings.go 一致：密钥只从环境变量进，不落库、不写日志、不出现在任何响应里；
// 缺省值刻意带 MOCK 字样，未注入真实 appid 时走模拟换取
package services

import (
	"os"
	"strings"
	"time"
)

// 微信开放接口路径：网关可以换成自建代理，路径固定
const (
	mpPathCode2Session = "/sns/jscode2session"
	mpPathAccessToken  = "/cgi-bin/token"
	mpPathPhone        = "/wxa/business/getuserphonenumber"
)

var (
	// mpWxAppID 小程序 appid，与支付用的公众号 appid 是两个身份，不能互相顶替
	mpWxAppID = mpEnv("WX_MP_APP_ID", "wxMOCK000000000001")
	// mpWxAppSecret 小程序密钥，只在服务端换身份时使用，任何接口都不回传
	mpWxAppSecret = mpEnv("WX_MP_APP_SECRET", "MOCK-WX-MP-APP-SECRET")
	// mpWxGateway 微信开放接口域名
	mpWxGateway = mpEnv("WX_MP_GATEWAY", "https://api.weixin.qq.com")
)

// mpWxTimeout 身份换取在登录链路上同步等待，超时兜底避免挂住请求线程
const mpWxTimeout = 8 * time.Second

// mpWechatMock 未注入真实 appid（为空或含 MOCK）时按模拟换取处理
// 模拟只替换「渠道响应报文」这一层，errcode 判断、合并与签发令牌的代码与真实渠道一字不差
func mpWechatMock() bool {
	return mpWxAppID == "" || strings.Contains(strings.ToUpper(mpWxAppID), "MOCK")
}

// mpEnv 读取环境变量，空值按缺省处理
func mpEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
