// middleware 中间件层
// csrf.go CSRF 防护中间件
// 使用 SameSite=Lax Cookie + Double Submit Cookie 模式进行防护
//
// 防护层级:
//   1. SameSite=Lax → 浏览器阻止跨站请求携带 Cookie (第一防线)
//   2. Double Submit Cookie → CSRF Cookie 与 Header 必须匹配 (第二防线)
//
// 写操作校验规则 (POST/PUT/DELETE/PATCH):
//   - POST /api/login → 豁免 (引导端点, 首次设置 CSRF Cookie)
//   - 缺少 CSRF Cookie → 拒绝 (403)
//   - CSRF Cookie 存在但 Header 缺失或不匹配 → 拒绝 (403)
//
// 读操作 (GET/HEAD/OPTIONS) 不校验，放行。
package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"

	"go-gin/config"

	"github.com/gin-gonic/gin"
)

// csrfCookieName CSRF Token Cookie 名称
const csrfCookieName = "sso_csrf"

// csrfHeaderName 前端应在请求头中携带 CSRF Token 的名称
const csrfHeaderName = "X-CSRF-Token"

// csrfExemptPaths 引导型写接口：调用时浏览器还没有 CSRF Cookie，必须豁免
var csrfExemptPaths = map[string]bool{
	"/api/login":                      true,
	"/api/register":                   true,
	"/api/auth/password/reset":        true,
	"/api/auth/password/reset-verify": true,
}

// csrfExemptPrefixes 渠道公网回调：支付宝/微信服务器不带 Cookie 也不带会话，
// 来源合法性由渠道签名保证（见 payment.Provider.ParseNotify），CSRF 这套在这里无从校验也不该校验
var csrfExemptPrefixes = []string{"/api/payment/notify/"}

// csrfExempt 判断写接口是否绕过 CSRF 校验
func csrfExempt(path string) bool {
	if csrfExemptPaths[path] {
		return true
	}
	for _, prefix := range csrfExemptPrefixes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// CSRFMiddleware CSRF 防护中间件
func CSRFMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 读操作放行
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}

		// 引导端点豁免 (登录/注册时第一次设置 CSRF Cookie) 与渠道公网回调
		if csrfExempt(c.Request.URL.Path) {
			c.Next()
			return
		}

		cookieVal, _ := c.Cookie(csrfCookieName)
		headerVal := c.GetHeader(csrfHeaderName)

		// 缺少 CSRF Cookie → 拒绝
		if cookieVal == "" {
			Error(c, http.StatusForbidden, "CSRF 防护：缺少 CSRF Cookie")
			c.Abort()
			return
		}

		// Cookie 值与 Header 值不匹配 → 拒绝
		if cookieVal != headerVal {
			Error(c, http.StatusForbidden, "CSRF 校验失败")
			c.Abort()
			return
		}

		c.Next()
	}
}

// SetCSRFCookie 在登录成功等时机设置 CSRF Cookie
// 前端可读（HttpOnly=false），后续写操作在 X-CSRF-Token 头中回传
func SetCSRFCookie(c *gin.Context) string {
	token := generateRandomToken()
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		Secure:   config.CookieSecure,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
	c.Header("X-CSRF-Token", token)
	return token
}

// ClearCSRFCookie 清除 CSRF Cookie（登出时调用）
func ClearCSRFCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     csrfCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Secure:   config.CookieSecure,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
}

// generateRandomToken 生成 32 字节随机十六进制字符串
func generateRandomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
