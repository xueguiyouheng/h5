// services 业务逻辑层
// notification_service.go 站内通知：列表、未读数、单条/全部已读
// 已读状态按会员记录在 notifications.read_by，实现多端同步
package services

import (
	"time"

	"go-gin/config"
	"go-gin/models"
)

// NotificationService 通知业务服务
type NotificationService struct{}

// NewNotificationService 创建通知服务实例
func NewNotificationService() *NotificationService { return &NotificationService{} }

// routeWhitelist 允许后端下发的跳转路由，防止任意跳转
var routeWhitelist = map[string]bool{
	"/shop": true, "/orders": true, "/vouchers": true,
	"/addresses": true, "/help": true, "/chat": true, "/profile": true,
}

// sanitizeLink 仅保留白名单内的路由
func sanitizeLink(link *models.Link) *models.Link {
	if link == nil {
		return nil
	}
	if !routeWhitelist[link.Route] {
		return nil
	}
	return link
}

// List 分页取通知并标记当前会员已读状态
func (s *NotificationService) List(memberID string, page, pageSize int) (*models.PageResult, error) {
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 20)

	filter := config.M(map[string]interface{}{})
	total, err := countDocs(config.Collections.Notifications, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Notification
	if err := findDocs(config.Collections.Notifications, filter, "created_at", true, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Read = containsString(list[i].ReadBy, memberID)
		list[i].Link = sanitizeLink(list[i].Link)
		list[i].ReadBy = nil
	}
	if list == nil {
		list = []models.Notification{}
	}
	return &models.PageResult{List: list, Total: total, Page: page, PageSize: pageSize}, nil
}

// UnreadCount 未读条数
func (s *NotificationService) UnreadCount(memberID string) (*models.UnreadCount, error) {
	if err := checkMongo(); err != nil {
		return nil, err
	}
	ctx, cancel := newContext()
	defer cancel()
	count, err := config.Col(config.Collections.Notifications).CountDocuments(ctx,
		config.M(map[string]interface{}{"read_by": map[string]interface{}{"$ne": memberID}}))
	if err != nil {
		return nil, err
	}
	return &models.UnreadCount{Count: count}, nil
}

// MarkRead 标记指定通知已读
func (s *NotificationService) MarkRead(memberID string, ids []string) error {
	if len(ids) == 0 {
		return ErrBadRequest("请提供要标记的通知 ID")
	}
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Notifications).UpdateMany(ctx,
		config.M(map[string]interface{}{"_id": map[string]interface{}{"$in": ids}}),
		config.M(map[string]interface{}{"$addToSet": map[string]interface{}{"read_by": memberID}}),
	)
	return err
}

// MarkAllRead 全部标记已读
func (s *NotificationService) MarkAllRead(memberID string) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Notifications).UpdateMany(ctx,
		config.M(map[string]interface{}{}),
		config.M(map[string]interface{}{"$addToSet": map[string]interface{}{"read_by": memberID}}),
	)
	return err
}

// containsString 判断字符串切片是否包含目标值
func containsString(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// PushOrderNotice 下单后推送一条通知，供订单服务调用
func (s *NotificationService) PushOrderNotice(order *models.Order) {
	now := time.Now().UTC()
	notice := &models.Notification{
		ID:          newID(),
		Kind:        "payment",
		Title:       "Order confirmed",
		Description: "Order " + order.OrderNo + " is accepted, total " + currencySymbol(order.Currency) + order.Total + ".",
		Link:        &models.Link{Label: "查看订单", Route: "/orders"},
		CreatedAt:   now,
	}
	_ = insertDoc(config.Collections.Notifications, notice)
}
