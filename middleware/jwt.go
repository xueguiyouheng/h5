// middleware 中间件层
// jwt.go 提供 JWT 鉴权中间件 + Redis 令牌黑名单机制
//
// 令牌生命周期:
//   签发 → 带 jti (JWT ID) 的令牌返回给客户端
//   每请求 → 解析 JWT → 查 Redis 黑名单 (key=jwt:blacklist:{jti})
//   登出 → 将 jti 写入 Redis 黑名单，TTL = token 剩余有效期
//
// Redis 不可用时优雅降级：跳过黑名单检查，仅做签名校验
package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/utils"

	"github.com/gin-gonic/gin"
)

// JWTAuthMiddleware JWT 鉴权中间件
func JWTAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			Error(c, http.StatusUnauthorized, "未登录或登录已过期")
			c.Abort()
			return
		}

		claims, err := utils.ParseToken(token, config.JwtSecret)
		if err != nil {
			Error(c, http.StatusUnauthorized, "登录已过期，请重新登录")
			c.Abort()
			return
		}

		if config.RedisEnabled && claims.Id != "" {
			blacklistKey := fmt.Sprintf("jwt:blacklist:%s", claims.Id)
			exists, err := config.RDB.Exists(blacklistKey).Result()
			if err == nil && exists > 0 {
				Error(c, http.StatusUnauthorized, "登录已失效，请重新登录")
				c.Abort()
				return
			}
		}

		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("jti", claims.Id)
		c.Set("exp", claims.ExpiresAt)
		if claims.MemberID != "" {
			c.Set("memberID", claims.MemberID)
		}
		c.Next()
	}
}

// BlacklistToken 将 JWT 令牌加入黑名单
func BlacklistToken(jti string, expiresAt int64) {
	if !config.RedisEnabled || jti == "" {
		return
	}
	ttl := time.Until(time.Unix(expiresAt, 0))
	if ttl <= 0 {
		return
	}
	key := fmt.Sprintf("jwt:blacklist:%s", jti)
	_ = config.RDB.Set(key, "1", ttl).Err()
}

// extractToken 从请求中提取 JWT 令牌
func extractToken(c *gin.Context) string {
	if token, err := c.Cookie(config.CookieName); err == nil && token != "" {
		return token
	}
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return parts[1]
		}
	}
	return ""
}

// SetAuthCookie 在登录成功时写入 HttpOnly Cookie
func SetAuthCookie(c *gin.Context, token string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     config.CookieName,
		Value:    token,
		Path:     config.CookiePath,
		MaxAge:   maxAge,
		Secure:   config.CookieSecure,
		HttpOnly: config.CookieHTTPOnly,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearAuthCookie 在登出时清除 JWT Cookie
func ClearAuthCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     config.CookieName,
		Value:    "",
		Path:     config.CookiePath,
		MaxAge:   -1,
		Secure:   config.CookieSecure,
		HttpOnly: config.CookieHTTPOnly,
		SameSite: http.SameSiteLaxMode,
	})
}
