// controllers 控制层
// account_controller.go 账户与资料：注册、当前用户、资料维护、设置、法务文案、引导页、找回密码
package controllers

import (
	"net/http"

	"go-gin/middleware"
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// AccountController 账户控制器
type AccountController struct {
	members  *services.MemberService
	settings *services.SettingService
}

// NewAccountController 创建账户控制器实例
func NewAccountController() *AccountController {
	return &AccountController{
		members:  services.NewMemberService(),
		settings: services.NewSettingService(),
	}
}

// Me 当前登录会员资料
// @Summary 当前登录会员资料
// @Description 用于前端登录态探测与 Profile 页头部；is_admin 表示该账号名下有门店，可进运营中台；account_type 为 buyer/merchant
// @Tags account
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.Member}
// @Failure 401 {object} models.ApiResponse "未登录或登录已失效"
// @Router /api/auth/me [get]
// @Router /api/profile [get]
func (c *AccountController) Me(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := markMerchant(member); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, member)
}

// Register 注册会员
// @Summary 注册商城会员
// @Description 校验口径与前端 validateProfileField 一致；密码以 bcrypt 存储；account_type 为 merchant 时同步建门店并把类型落库到账号
// @Tags account
// @Accept json
// @Produce json
// @Param body body models.RegisterRequest true "注册信息"
// @Success 201 {object} models.ApiResponse{data=models.RegisterResult}
// @Failure 400 {object} models.ApiResponse "字段校验失败"
// @Failure 409 {object} models.ApiResponse "邮箱或手机号已被注册"
// @Router /api/register [post]
func (c *AccountController) Register(ctx *gin.Context) {
	var req models.RegisterRequest
	if !bindJSON(ctx, &req) {
		return
	}
	result, err := c.members.Register(&req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, models.ApiResponse{Code: http.StatusCreated, Message: "success", Data: result})
}

// UpdateProfile 修改资料
// @Summary 修改会员资料
// @Description 只传需要修改的字段；修改密码必须带 old_password
// @Tags account
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.UpdateMemberRequest true "资料字段"
// @Success 200 {object} models.ApiResponse{data=models.Member}
// @Router /api/profile [put]
func (c *AccountController) UpdateProfile(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.UpdateMemberRequest
	if !bindJSON(ctx, &req) {
		return
	}
	updated, err := c.members.UpdateProfile(member.ID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := markMerchant(updated); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, updated)
}

// Completeness 资料完整度
// @Summary 资料完整度
// @Tags account
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.Completeness}
// @Router /api/profile/completeness [get]
func (c *AccountController) Completeness(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, c.members.Completeness(member))
}

// MarkOnboarded 引导页完成
// @Summary 标记引导页已完成
// @Tags account
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse
// @Router /api/onboarding/complete [post]
func (c *AccountController) MarkOnboarded(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	c.members.MarkOnboarded(member.ID)
	ok(ctx, nil)
}

// Settings 读取设置
// @Summary 读取语言与评分
// @Tags account
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.SettingsData}
// @Router /api/settings [get]
func (c *AccountController) Settings(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.settings.Settings(member.ID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SaveSettings 更新语言
// @Summary 更新界面语言
// @Tags account
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.LanguageRequest true "语言设置"
// @Success 200 {object} models.ApiResponse{data=models.SettingsData}
// @Router /api/settings [put]
func (c *AccountController) SaveSettings(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.LanguageRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.settings.SaveLanguage(member.ID, req.Language)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// AddRating 提交评分
// @Summary 提交星级评分
// @Tags account
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.RatingRequest true "评分值"
// @Success 200 {object} models.ApiResponse{data=models.RatingResult}
// @Router /api/settings/ratings [post]
func (c *AccountController) AddRating(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.RatingRequest
	if !bindJSON(ctx, &req) {
		return
	}
	result, err := c.settings.AddRating(member.ID, req.Value)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, result)
}

// Legal 条款与隐私文案
// @Summary 条款/隐私文案
// @Tags account
// @Produce json
// @Param key path string true "terms 或 privacy"
// @Success 200 {object} models.ApiResponse{data=models.LegalDoc}
// @Router /api/legal/{key} [get]
func (c *AccountController) Legal(ctx *gin.Context) {
	doc, err := c.settings.Legal(ctx.Param("key"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, doc)
}

// Onboarding 引导页内容
// @Summary 引导页文案与真实统计
// @Tags account
// @Produce json
// @Success 200 {object} models.ApiResponse{data=models.OnboardingData}
// @Router /api/onboarding/slides [get]
func (c *AccountController) Onboarding(ctx *gin.Context) {
	data, err := c.settings.Onboarding()
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// RequestPasswordReset 发起找回密码
// @Summary 发起找回密码
// @Description 邮箱不存在同样返回成功，避免账号枚举
// @Tags account
// @Accept json
// @Produce json
// @Param body body models.ResetPasswordRequest true "邮箱"
// @Success 200 {object} models.ApiResponse{data=models.ResetPasswordResult}
// @Router /api/auth/password/reset [post]
func (c *AccountController) RequestPasswordReset(ctx *gin.Context) {
	var req models.ResetPasswordRequest
	if !bindJSON(ctx, &req) {
		return
	}
	result, err := c.members.RequestReset(req.Email)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, result)
}

// VerifyPasswordReset 校验验证码并重置密码
// @Summary 校验重置验证码
// @Tags account
// @Accept json
// @Produce json
// @Param body body models.ResetVerifyRequest true "验证码与新密码"
// @Success 200 {object} models.ApiResponse
// @Router /api/auth/password/reset-verify [post]
func (c *AccountController) VerifyPasswordReset(ctx *gin.Context) {
	var req models.ResetVerifyRequest
	if !bindJSON(ctx, &req) {
		return
	}
	if err := c.members.VerifyReset(req.Code, req.NewPassword); err != nil {
		fail(ctx, err)
		return
	}
	middleware.Success(ctx, nil)
}
