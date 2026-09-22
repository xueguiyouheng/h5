// controllers 控制层
// MPAuthController 处理小程序授权登录与身份绑定
// 出参结构与 POST /api/login 一致：小程序把 token 存本地存储，后续请求带 Authorization + X-Client
package controllers

import (
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// MPAuthController 小程序账号控制器
type MPAuthController struct {
	service *services.MPAuthService // 小程序账号业务服务
}

// NewMPAuthController 创建小程序账号控制器实例
func NewMPAuthController() *MPAuthController {
	return &MPAuthController{
		service: services.NewMPAuthService(),
	}
}

// WechatLogin 微信小程序授权登录
// @Summary 微信小程序授权登录
// @Description 用 wx.login 的 code 换 openid；openid 未入库时按平台授权的手机号合并或新建账号，未带 phone_code 时不发令牌（422）
// @Description 响应不回 Cookie，客户端自行持有 token；请求 URL 上带 X-Client: mp_wechat
// @Tags miniprogram
// @Accept json
// @Produce json
// @Param body body models.MpWechatLoginRequest true "平台凭证 code 与可选的手机号授权 code"
// @Success 200 {object} models.ApiResponse{data=models.LoginResponse}
// @Failure 400 {object} models.ApiResponse "缺少 code 或 code 无效"
// @Failure 409 {object} models.ApiResponse "该手机号已绑定其他微信"
// @Failure 422 {object} models.ApiResponse "未授权手机号，客户端应拉起授权后重试"
// @Router /api/miniprogram/wechat/login [post]
func (c *MPAuthController) WechatLogin(ctx *gin.Context) {
	var req models.MpWechatLoginRequest
	if !bindJSON(ctx, &req) {
		return
	}
	res, err := c.service.WechatLogin(ctx.Request.Context(), req.Code, req.PhoneCode)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, res)
}

// BindWechat 绑定微信身份到当前登录会员
// @Summary 绑定微信身份
// @Description 已登录会员（密码登录或 H5 会话）用 wx.login 的 code 把 openid 绑到自己账号上，绑完即可静默登录
// @Description 只接受 code：openid 由服务端重新换取，不接受客户端自报，否则可以把别人的收款身份挂到自己账号上
// @Tags miniprogram
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.MpBindRequest true "wx.login 的 code"
// @Success 200 {object} models.ApiResponse
// @Failure 400 {object} models.ApiResponse "缺少 code 或 code 无效"
// @Failure 401 {object} models.ApiResponse "未登录"
// @Failure 409 {object} models.ApiResponse "该微信已绑定其他账号"
// @Router /api/miniprogram/bind [post]
func (c *MPAuthController) BindWechat(ctx *gin.Context) {
	var req models.MpBindRequest
	if !bindJSON(ctx, &req) {
		return
	}
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := c.service.BindWechat(ctx.Request.Context(), memberID, req.Code); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}
