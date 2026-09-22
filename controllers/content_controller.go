// controllers 控制层
// content_controller.go 内容与互动：通知、帮助 FAQ、客服会话、客服时段、图片上传
package controllers

import (
	"time"

	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// ContentController 内容与互动控制器
type ContentController struct {
	notifications *services.NotificationService
	help          *services.HelpService
	uploads       *services.UploadService
}

// NewContentController 创建内容控制器实例
func NewContentController() *ContentController {
	return &ContentController{
		notifications: services.NewNotificationService(),
		help:          services.NewHelpService(),
		uploads:       services.NewUploadService(),
	}
}

// Notifications 通知列表
// @Summary 站内通知分页列表
// @Tags notification
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 20"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/notifications [get]
func (c *ContentController) Notifications(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	page, size := pageParam(ctx, 20)
	data, err := c.notifications.List(memberID, page, size)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UnreadCount 未读数量
// @Summary 未读通知数量
// @Tags notification
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.UnreadCount}
// @Router /api/notifications/unread-count [get]
func (c *ContentController) UnreadCount(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.notifications.UnreadCount(memberID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// MarkRead 标记已读
// @Summary 标记通知已读
// @Tags notification
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.ReadRequest true "通知 ID 列表"
// @Success 200 {object} models.ApiResponse
// @Router /api/notifications/read [post]
func (c *ContentController) MarkRead(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.ReadRequest
	if !bindJSON(ctx, &req) {
		return
	}
	if err := c.notifications.MarkRead(memberID, req.IDs); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// MarkAllRead 全部已读
// @Summary 全部通知标记已读
// @Tags notification
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse
// @Router /api/notifications/read-all [post]
func (c *ContentController) MarkAllRead(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := c.notifications.MarkAllRead(memberID); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// FAQs 帮助问题
// @Summary FAQ 列表与客服联系方式
// @Tags help
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.FaqList}
// @Router /api/help/faqs [get]
func (c *ContentController) FAQs(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.help.FAQs(memberID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// VoteFaq FAQ 投票
// @Summary FAQ 是否有用投票
// @Tags help
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "FAQ ID"
// @Param body body models.VoteRequest true "helpful"
// @Success 200 {object} models.ApiResponse{data=models.VoteResult}
// @Router /api/help/faqs/{id}/vote [post]
func (c *ContentController) VoteFaq(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.VoteRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.help.Vote(memberID, ctx.Param("id"), *req.Helpful)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ChatMessages 会话历史
// @Summary 客服会话历史
// @Tags chat
// @Produce json
// @Security CookieAuth
// @Param cursor query string false "RFC3339 时间游标"
// @Param limit query int false "条数，默认 30"
// @Success 200 {object} models.ApiResponse{data=models.ChatList}
// @Router /api/chat/messages [get]
func (c *ContentController) ChatMessages(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.help.History(memberID, ctx.Query("cursor"), queryInt(ctx, "limit", 30))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SendChatMessage 发送消息
// @Summary 发送客服消息并拿到自动回复
// @Description 关键词命中逻辑与客服时段判定都在服务端，前端只负责打字动画
// @Tags chat
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.ChatRequest true "文本或图片消息"
// @Success 200 {object} models.ApiResponse{data=models.ChatReplyResult}
// @Router /api/chat/messages [post]
func (c *ContentController) SendChatMessage(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.ChatRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.help.Send(memberID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ClearChat 清空会话
// @Summary 清空客服会话
// @Tags chat
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse
// @Router /api/chat/messages [delete]
func (c *ContentController) ClearChat(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := c.help.ClearHistory(memberID); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// SupportStatus 客服在线状态
// @Summary 客服是否在线
// @Tags chat
// @Produce json
// @Success 200 {object} models.ApiResponse{data=models.SupportStatus}
// @Router /api/support/status [get]
func (c *ContentController) SupportStatus(ctx *gin.Context) {
	ok(ctx, c.help.SupportStatus(time.Now().UTC()))
}

// UploadImage 图片上传
// @Summary 图片上传
// @Description multipart/form-data，字段名 file；落 uploads/YYYYMM/ 并由静态目录托管，数据库只存 URL
// @Tags upload
// @Accept multipart/form-data
// @Produce json
// @Security CookieAuth
// @Param file formData file true "图片文件，最大 5MB"
// @Success 200 {object} models.ApiResponse{data=models.Upload}
// @Failure 400 {object} models.ApiResponse "文件缺失 / 超大 / 类型不支持"
// @Router /api/uploads [post]
func (c *ContentController) UploadImage(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	upload, err := c.uploads.Save(ctx, memberID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, upload)
}

// Uploads 素材库
// @Summary 素材库分页
// @Tags upload
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 24"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/uploads [get]
func (c *ContentController) Uploads(ctx *gin.Context) {
	if _, err := currentMemberID(ctx); err != nil {
		fail(ctx, err)
		return
	}
	page, size := pageParam(ctx, 24)
	data, err := c.uploads.List(page, size)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// DeleteUpload 删除素材
// @Summary 删除素材
// @Tags upload
// @Produce json
// @Security CookieAuth
// @Param id path string true "素材 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/uploads/{id} [delete]
func (c *ContentController) DeleteUpload(ctx *gin.Context) {
	if _, err := currentMemberID(ctx); err != nil {
		fail(ctx, err)
		return
	}
	if err := c.uploads.Delete(ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}
