// middleware 中间件层
// 提供统一响应格式封装、限流等通用功能，在路由注册时通过 r.Use() 挂载
package middleware

import (
	"net/http"

	"go-gin/models"

	"github.com/gin-gonic/gin"
)

// ResponseMiddleware 响应中间件
// 目前仅作为占位，后续可在此处添加统一响应处理逻辑（如请求日志、trace-id 注入等）
func ResponseMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

// Success 封装成功响应
// 所有接口的成功响应都通过此函数生成，保证响应格式一致
// 统一返回: {code: 200, message: "success", data: <业务数据>}
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Code:    http.StatusOK,
		Message: "success",
		Data:    data,
	})
}

// Error 封装错误响应
// 所有接口的错误响应都通过此函数生成，保证响应格式一致
// 可指定 HTTP 状态码和错误信息
// 统一返回: {code: <状态码>, message: "<错误信息>", data: null}
func Error(c *gin.Context, code int, message string) {
	c.JSON(code, models.ApiResponse{
		Code:    code,
		Message: message,
		Data:    nil,
	})
}