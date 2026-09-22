// controllers 控制层
// 处理 HTTP 请求/响应，调用 services 层完成业务逻辑
package controllers

import (
	"go-gin/middleware"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// HomeController 首页控制器
// 负责处理首页相关的 HTTP 请求
type HomeController struct {
	service *services.HomeService // 首页业务服务
}

// NewHomeController 创建首页控制器实例
func NewHomeController() *HomeController {
	return &HomeController{
		service: services.NewHomeService(),
	}
}

// GetHello 处理首页 GET 请求
// 返回问候信息，使用统一的成功响应格式
func (c *HomeController) GetHello(ctx *gin.Context) {
	response := c.service.GetHello()
	middleware.Success(ctx, response)
}
