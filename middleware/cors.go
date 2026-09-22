// middleware 中间件层
// cors.go 提供跨域资源共享 (CORS) 中间件
// 支持凭证携带 (withCredentials)，适配 Cookie 鉴权模式
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware CORS 跨域中间件
// 允许前端开发时跨域访问后端 API，支持 Cookie 凭证携带
//
// 注意：Access-Control-Allow-Origin 不能为 "*" 当 Allow-Credentials=true
// 开发模式动态回显请求的 Origin，生产环境应改为白名单
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, Accept, X-Requested-With, X-CSRF-Token")
		c.Header("Access-Control-Expose-Headers", "Content-Length, Content-Disposition, X-CSRF-Token")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
