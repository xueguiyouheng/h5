// services 业务逻辑层
// order_service.go 订单：下单、列表分页、详情、取消与物流轨迹
package services

import (
	"fmt"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// OrderService 订单业务服务
type OrderService struct {
	cart    *CartService
	address *AddressService
	voucher *VoucherService
	members *MemberService
}

// NewOrderService 创建订单服务实例
func NewOrderService() *OrderService {
	return &OrderService{
		cart:    NewCartService(),
		address: NewAddressService(),
		voucher: NewVoucherService(),
		members: NewMemberService(),
	}
}

// orderTabs 订单状态归属的列表标签
var orderTabs = map[string]string{
	"accepted":  "ongoing",
	"ready":     "ongoing",
	"delivered": "history",
	"cancelled": "history",
}

// orderPaymentMethods 下单可选的支付方式，与前端 Checkout 页一致
var orderPaymentMethods = map[string]bool{
	"alipay": true,
	"wechat": true,
}

// stepTemplates 物流轨迹模板
var stepTemplates = []struct{ code, label string }{
	{"accepted", "Order accepted"},
	{"preparing", "Packing at store"},
	{"ready", "Ready to collect"},
	{"delivered", "Order delivered"},
}

// statusRank 状态对应的轨迹进度
var statusRank = map[string]int{"accepted": 1, "ready": 3, "delivered": 4}

// List 按标签分页取订单
func (s *OrderService) List(memberID, tab string, page, pageSize int) (*models.PageResult, error) {
	tab = firstNonEmpty(tab, "ongoing")
	if tab != "ongoing" && tab != "history" {
		return nil, ErrBadRequest("订单标签取值不合法")
	}
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 6)

	filter := config.M(map[string]interface{}{"member_id": memberID, "tab": tab})
	total, err := countDocs(config.Collections.Orders, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Order
	if err := findDocs(config.Collections.Orders, filter, "created_at", true, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Order{}
	}
	return &models.PageResult{List: list, Total: total, Page: page, PageSize: pageSize}, nil
}

// ByID 取会员名下订单
func (s *OrderService) ByID(memberID, id string) (*models.Order, error) {
	var order models.Order
	if err := findOneDoc(config.Collections.Orders, config.M(map[string]interface{}{
		"_id":       id,
		"member_id": memberID,
	}), &order); err != nil {
		return nil, err
	}
	if order.ID == "" {
		return nil, nil
	}
	return &order, nil
}

// Detail 订单详情
func (s *OrderService) Detail(memberID, id string) (*models.Order, error) {
	order, err := s.ByID(memberID, id)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, ErrNotFound("订单不存在")
	}
	return order, nil
}

// Create 下单：结算选中行项目、扣减库存、占用优惠券并从购物车移除
// store 是买家当前门店，nil 时订单不带门店（环境里还没有门店数据的过渡态）
func (s *OrderService) Create(memberID string, store *models.Store, req *models.CreateOrderRequest) (*models.CreateOrderResult, error) {
	storeID := ""
	if store != nil {
		storeID = store.ID
	}
	items, err := s.cart.items(memberID, storeID)
	if err != nil {
		return nil, err
	}
	if len(req.ItemIDs) > 0 {
		wanted := map[string]bool{}
		for _, id := range req.ItemIDs {
			wanted[id] = true
		}
		picked := make([]models.CartItem, 0, len(items))
		for _, item := range items {
			if wanted[item.ProductID] {
				item.Selected = true
				picked = append(picked, item)
			}
		}
		items = picked
	} else {
		selected := make([]models.CartItem, 0, len(items))
		for _, item := range items {
			if item.Selected {
				selected = append(selected, item)
			}
		}
		items = selected
	}
	if len(items) == 0 {
		return nil, ErrUnprocessable("购物车没有可结算的商品")
	}
	if req.PaymentMethod != "" && !orderPaymentMethods[req.PaymentMethod] {
		return nil, ErrUnprocessable("支付方式只支持支付宝或微信")
	}

	var voucher *models.Voucher
	if req.VoucherID != "" {
		v, err := s.voucher.ByID(memberID, req.VoucherID)
		if err != nil {
			return nil, err
		}
		if v == nil {
			return nil, ErrNotFound("优惠券不存在")
		}
		voucher = v
	}
	data, reason := ComputeTotals(items, voucher, req.VoucherID)
	if req.VoucherID != "" && reason != "" {
		return nil, ErrUnprocessable(reason)
	}

	addressID := req.AddressID
	if addressID == "" {
		list, err := s.address.List(memberID)
		if err != nil {
			return nil, err
		}
		addressID = list.DefaultID
	}
	address, err := s.address.ByID(memberID, addressID)
	if err != nil {
		return nil, err
	}
	if address == nil {
		return nil, ErrUnprocessable("请先添加收货地址")
	}

	orderItems := make([]models.OrderItem, 0, len(items))
	for _, item := range items {
		orderItems = append(orderItems, models.OrderItem{
			ProductID: item.ProductID,
			Name:      item.Name,
			ImageURL:  item.ImageURL,
			UnitPrice: item.Price,
			Qty:       item.Qty,
			LineTotal: item.LineTotal,
		})
	}

	// 收货人快照：中台接单后要能直接联系买家，不能只给一个地址标签
	receiver, receiverPhone := "", ""
	member, err := s.members.ByID(memberID)
	if err != nil {
		return nil, err
	}
	if member != nil {
		receiver, receiverPhone = member.Username, member.Mobile
	}
	if receiver == "" {
		receiver = address.Label
	}

	storeName := ""
	if store != nil {
		storeName = store.Name
	}

	now := time.Now().UTC()
	order := &models.Order{
		ID:            newID(),
		OrderNo:       fmt.Sprintf("FM%s", now.Format("20060102150405")),
		MemberID:      memberID,
		StoreID:       storeID,
		StoreName:     storeName,
		AddressID:     address.ID,
		AddressLabel:  address.Label,
		AddressDetail: address.Detail,
		Receiver:      receiver,
		ReceiverPhone: receiverPhone,
		Status:        "accepted",
		Tab:           orderTabs["accepted"],
		Items:         orderItems,
		Currency:      data.Currency,
		Subtotal:      data.SelectedTotal,
		Discount:      data.Discount,
		DeliveryFee:   data.DeliveryFee,
		Total:         data.Payable,
		VoucherID:     req.VoucherID,
		PaymentMethod: req.PaymentMethod,
		PaymentStatus: "unpaid",
		ETA:           deliveryETA(),
		Steps:         BuildSteps("accepted", now),
		Remark:        strings.TrimSpace(req.Remark),
		CreatedAt:     now,
	}
	if err := insertDoc(config.Collections.Orders, order); err != nil {
		return nil, err
	}

	for _, item := range items {
		if err := deductStock(item.ProductID, item.Qty); err != nil {
			return nil, err
		}
	}
	if err := s.voucher.MarkUsed(req.VoucherID); err != nil {
		return nil, err
	}
	if err := s.removeOrderedLines(memberID, items); err != nil {
		return nil, err
	}

	return &models.CreateOrderResult{
		ID:      order.ID,
		OrderNo: order.OrderNo,
		Status:  order.Status,
		Payable: order.Total,
	}, nil
}

// removeOrderedLines 下单成功后从购物车移除已结算行
func (s *OrderService) removeOrderedLines(memberID string, items []models.CartItem) error {
	ordered := map[string]bool{}
	for _, item := range items {
		ordered[item.ProductID] = true
	}
	ids := make([]string, 0, len(ordered))
	for id := range ordered {
		ids = append(ids, id)
	}
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Carts).UpdateMany(ctx,
		config.M(map[string]interface{}{"member_id": memberID}),
		config.M(map[string]interface{}{"$pull": map[string]interface{}{"lines": map[string]interface{}{"product_id": map[string]interface{}{"$in": ids}}}}),
	)
	return err
}

// deductStock 扣库存并累计销量
func deductStock(productID string, qty int) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Products).UpdateOne(ctx,
		config.M(map[string]interface{}{"_id": productID, "stock": map[string]interface{}{"$gte": qty}}),
		config.M(map[string]interface{}{
			"$inc": map[string]interface{}{"stock": -qty, "sales": qty},
			"$set": map[string]interface{}{"updated_at": time.Now().UTC()},
		}),
	)
	return err
}

// AdvanceStatus 后台推进订单状态，供轨迹演示使用
func (s *OrderService) AdvanceStatus(memberID, id, status string) (*models.Order, error) {
	if _, ok := orderTabs[status]; !ok {
		return nil, ErrBadRequest("订单状态取值不合法")
	}
	order, err := s.ByID(memberID, id)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, ErrNotFound("订单不存在")
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(map[string]interface{}{
		"status": status,
		"tab":    orderTabs[status],
		"steps":  BuildSteps(status, order.CreatedAt),
	})); err != nil {
		return nil, err
	}
	return s.ByID(memberID, id)
}

// BuildSteps 依状态生成轨迹节点，done 与状态进度对应
func BuildSteps(status string, created time.Time) []models.OrderStep {
	rank := statusRank[status]
	steps := make([]models.OrderStep, 0, len(stepTemplates)+1)
	for i, tpl := range stepTemplates {
		at := ""
		if i < rank {
			at = created.Add(time.Duration(i*15) * time.Minute).Format(time.RFC3339)
		}
		steps = append(steps, models.OrderStep{Code: tpl.code, Label: tpl.label, At: at, Done: i < rank})
	}
	return steps
}

// Cancel 取消订单：回退库存与优惠券
func (s *OrderService) Cancel(memberID, id string) (*models.Order, error) {
	order, err := s.ByID(memberID, id)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, ErrNotFound("订单不存在")
	}
	if order.Tab == "history" {
		return nil, ErrUnprocessable("该订单已结束，无法取消")
	}
	for _, item := range order.Items {
		if err := restoreStock(item.ProductID, item.Qty); err != nil {
			return nil, err
		}
	}
	if err := s.voucher.Release(order.VoucherID); err != nil {
		return nil, err
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(map[string]interface{}{
		"status": "cancelled",
		"tab":    "history",
		"steps":  CancelledSteps(order.CreatedAt),
	})); err != nil {
		return nil, err
	}
	return s.ByID(memberID, id)
}

// restoreStock 回补库存与销量
func restoreStock(productID string, qty int) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Products).UpdateOne(ctx,
		config.M(map[string]interface{}{"_id": productID}),
		config.M(map[string]interface{}{"$inc": map[string]interface{}{"stock": qty, "sales": -qty}}),
	)
	return err
}

// CancelledSteps 取消单的轨迹：已完成到接单，末节点标记取消
func CancelledSteps(created time.Time) []models.OrderStep {
	steps := BuildSteps("accepted", created)
	return append(steps, models.OrderStep{
		Code:  "cancelled",
		Label: "Order cancelled",
		At:    time.Now().UTC().Format(time.RFC3339),
		Done:  true,
	})
}

// Track 订单轨迹
func (s *OrderService) Track(memberID, id string) (*models.OrderTrack, error) {
	order, err := s.Detail(memberID, id)
	if err != nil {
		return nil, err
	}
	return &models.OrderTrack{
		ID:      order.ID,
		Status:  order.Status,
		Steps:   order.Steps,
		ETA:     order.ETA,
		Courier: map[string]interface{}{"name": "FreshMart Rider", "phone": SupportInfo().Phone},
	}, nil
}
