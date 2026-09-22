// controllers 控制层
// AuthController 负责处理登录认证相关的 HTTP 请求
package controllers

import (
	"net/http"

	"go-gin/config"
	"go-gin/middleware"
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// AuthController 认证控制器
// 处理用户登录/登出请求，签发并管理 JWT Cookie
type AuthController struct {
	service *services.AuthService // 认证业务服务
}

// NewAuthController 创建认证控制器实例
func NewAuthController() *AuthController {
	return &AuthController{
		service: services.NewAuthService(),
	}
}

// Login 处理用户登录请求
// @Summary 登录并签发会话 Cookie
// @Description 账号可以是 SSO 用户名，也可以是商城会员邮箱/用户名/手机号；成功后写入 sso_token 与 sso_csrf
// @Tags auth
// @Accept json
// @Produce json
// @Param body body models.LoginRequest true "账号与密码"
// @Success 200 {object} models.ApiResponse{data=models.LoginResponse}
// @Failure 401 {object} models.ApiResponse "用户名或密码错误"
// @Router /api/login [post]
func (c *AuthController) Login(ctx *gin.Context) {
	var req models.LoginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		middleware.Error(ctx, http.StatusBadRequest, "无效的请求参数")
		return
	}

	token, err := c.service.Login(req.Account(), req.Password, ctx.ClientIP())
	if err != nil {
		middleware.Error(ctx, http.StatusUnauthorized, err.Error())
		return
	}

	// 写入 HttpOnly Cookie (最安全, JS 无法读取)
	middleware.SetAuthCookie(ctx, token, int(config.CookieMaxAge.Seconds()))

	// 设置 CSRF Token Cookie (前端可读, 用于后续写请求校验)
	middleware.SetCSRFCookie(ctx)

	middleware.Success(ctx, &models.LoginResponse{
		Token:     token,
		TokenType: "Bearer",
	})
}

// Logout 用户登出
// 1. 将当前 JWT 加入 Redis 黑名单 (TTL = token 剩余有效期)
// 2. 清除浏览器中的 JWT Cookie 和 CSRF Cookie
// @Summary 登出
// @Tags auth
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse
// @Router /api/logout [post]
func (c *AuthController) Logout(ctx *gin.Context) {
	jti := ctx.GetString("jti")
	exp := ctx.GetInt64("exp")
	middleware.BlacklistToken(jti, exp)

	middleware.ClearAuthCookie(ctx)
	middleware.ClearCSRFCookie(ctx)
	middleware.Success(ctx, nil)
}
