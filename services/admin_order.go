// services 业务逻辑层
// admin_order.go 中台订单处理：状态看板计数、订单检索、推进状态、取消、备注与配送信息
// 一单一店：订单建单时已快照 store_id，中台只按它取数，别家门店的单查不到也改不了
package services

import (
	"regexp"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
	"go-gin/payment"

	"go.mongodb.org/mongo-driver/bson"
)

// adminOrderFlow 中台允许的状态流转，已送达与已取消是终态
// 允许 ready 退回 accepted，商家误点「备货完成」时可以纠正
var adminOrderFlow = map[string][]string{
	"accepted":  {"ready", "delivered"},
	"ready":     {"accepted", "delivered"},
	"delivered": {},
	"cancelled": {},
}

// adminOrderStatus 中台可筛选的状态集合
var adminOrderStatus = map[string]bool{
	"accepted": true, "ready": true, "delivered": true, "cancelled": true,
}

// todayScanLimit 今日订单条数上限，用于金额合计；单店单日订单量远小于此
const todayScanLimit = 500

// orderMemberScan 一次联表回填的买家数上限，等于订单分页最大值
const orderMemberScan = 50

// AdminOrderQuery 中台订单列表入参
type AdminOrderQuery struct {
	StoreID       string // 商家自己的门店，必填
	Keyword       string // 单号 / 收货人 / 手机号模糊匹配
	Status        string
	PaymentStatus string
	Since         string // RFC3339
	Until         string
	Page          int
	PageSize      int
}

// AdminOrders 订单分页，按下单时间倒序；买家信息联表回填
func (s *AdminService) AdminOrders(q AdminOrderQuery) (*models.PageResult, error) {
	filter, err := adminOrderFilter(q)
	if err != nil {
		return nil, err
	}
	total, err := countDocs(config.Collections.Orders, filter)
	if err != nil {
		return nil, err
	}
	page := clampPage(q.Page)
	size := clampPageSize(q.PageSize, 10)
	var list []models.Order
	if err := findDocs(config.Collections.Orders, filter, "created_at", true, size, (page-1)*size, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Order{}
	}
	if err := s.fillBuyers(list); err != nil {
		return nil, err
	}
	return &models.PageResult{List: list, Total: total, Page: page, PageSize: size}, nil
}

// adminOrderFilter 组装订单检索条件，门店归属永远在最前面
func adminOrderFilter(q AdminOrderQuery) (bson.M, error) {
	if q.StoreID == "" {
		return nil, ErrBadRequest("缺少门店身份")
	}
	filter := withStore(q.StoreID, bson.M{})
	if status := strings.TrimSpace(q.Status); status != "" {
		if !adminOrderStatus[status] {
			return nil, ErrBadRequest("订单状态取值不合法")
		}
		filter["status"] = status
	}
	if ps := strings.TrimSpace(q.PaymentStatus); ps != "" {
		filter["payment_status"] = ps
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		quoted := regexp.QuoteMeta(keyword)
		// 中台最常做的事是照着单号或手机号找单，三个字段一起模糊匹配
		filter["$or"] = []bson.M{
			{"order_no": bson.M{"$regex": quoted, "$options": "i"}},
			{"receiver": bson.M{"$regex": quoted, "$options": "i"}},
			{"receiver_phone": bson.M{"$regex": quoted, "$options": "i"}},
		}
	}
	if r := timeRange(q.Since, q.Until); len(r) > 0 {
		filter["created_at"] = r
	}
	return filter, nil
}

// fillBuyers 一次查回当页买家，中台列表才能显示谁下的单
func (s *AdminService) fillBuyers(list []models.Order) error {
	if len(list) == 0 {
		return nil
	}
	ids := make([]string, 0, len(list))
	for i := range list {
		if list[i].MemberID != "" {
			ids = append(ids, list[i].MemberID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var members []models.Member
	if err := findDocs(config.Collections.Members, config.M(map[string]interface{}{"_id": bson.M{"$in": ids}}), "", false, orderMemberScan, 0, &members); err != nil {
		return err
	}
	byID := make(map[string]models.Member, len(members))
	for _, m := range members {
		byID[m.ID] = m
	}
	for i := range list {
		if m, ok := byID[list[i].MemberID]; ok {
			list[i].MemberName = firstNonEmpty(m.Username, m.Email)
			list[i].MemberMobile = m.Mobile
		}
	}
	return nil
}

// AdminOrderSummary 订单看板计数：各状态单量 + 今日新单 + 今日已收金额
func (s *AdminService) AdminOrderSummary(storeID string) (*models.AdminOrderSummary, error) {
	out := &models.AdminOrderSummary{Currency: cartCurrency}
	counts := []struct {
		filter bson.M
		target *int64
	}{
		{withStore(storeID, bson.M{}), &out.All},
		{withStore(storeID, bson.M{"payment_status": "unpaid"}), &out.Unpaid},
		{withStore(storeID, bson.M{"status": "accepted"}), &out.Accepted},
		{withStore(storeID, bson.M{"status": "ready"}), &out.Ready},
		{withStore(storeID, bson.M{"status": "delivered"}), &out.Delivered},
		{withStore(storeID, bson.M{"status": "cancelled"}), &out.Cancelled},
		{withStore(storeID, bson.M{"created_at": bson.M{"$gte": startOfToday()}}), &out.TodayNew},
	}
	for _, c := range counts {
		n, err := countDocs(config.Collections.Orders, c.filter)
		if err != nil {
			return nil, err
		}
		*c.target = n
	}

	var todayPaid []models.Order
	err := findDocs(config.Collections.Orders, withStore(storeID, bson.M{
		"payment_status": "paid",
		"created_at":     bson.M{"$gte": startOfToday()},
	}), "created_at", true, todayScanLimit, 0, &todayPaid)
	if err != nil {
		return nil, err
	}
	var sum float64
	for _, o := range todayPaid {
		sum += priceValue(o.Total)
	}
	out.TodayPaidAmount = money(round2(sum))
	return out, nil
}

// startOfToday 今日零点
// 商家看板是「本地今天」的口径，created_at 带时区比较，不受库里存 UTC 的影响
func startOfToday() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// AdminOrderDetail 订单详情，附支付单流水
func (s *AdminService) AdminOrderDetail(storeID, id string) (*models.AdminOrderDetail, error) {
	order, err := s.adminOrder(storeID, id)
	if err != nil {
		return nil, err
	}
	var payments []payment.Payment
	if err := findDocs(config.Collections.Payments, config.M(map[string]interface{}{"order_id": id}), "created_at", true, 10, 0, &payments); err != nil {
		return nil, err
	}
	views := make([]models.AdminOrderPayment, 0, len(payments))
	for _, p := range payments {
		views = append(views, models.AdminOrderPayment{
			ID:         p.ID,
			Provider:   p.Provider,
			Amount:     p.Amount,
			Currency:   p.Currency,
			Status:     p.Status,
			TradeNo:    p.TradeNo,
			CreatedAt:  p.CreatedAt,
			PaidAt:     p.PaidAt,
			FailReason: p.FailReason,
		})
	}
	list := []models.Order{*order}
	if err := s.fillBuyers(list); err != nil {
		return nil, err
	}
	return &models.AdminOrderDetail{Order: list[0], Payments: views}, nil
}

// adminOrder 取本店订单，别家门店的 ID 按不存在处理
func (s *AdminService) adminOrder(storeID, id string) (*models.Order, error) {
	var order models.Order
	if err := findOneDoc(config.Collections.Orders, withStore(storeID, bson.M{"_id": id}), &order); err != nil {
		return nil, err
	}
	if order.ID == "" {
		return nil, ErrNotFound("订单不存在")
	}
	return &order, nil
}

// AdminOrderSetStatus 推进状态：未支付的单不能开工，回退只能退回接单
func (s *AdminService) AdminOrderSetStatus(storeID, id, status, note, operator string) (*models.Order, error) {
	order, err := s.adminOrder(storeID, id)
	if err != nil {
		return nil, err
	}
	if !adminOrderStatus[status] {
		return nil, ErrBadRequest("订单状态取值不合法")
	}
	if order.Status == status {
		return nil, ErrUnprocessable("订单已经处于该状态")
	}
	allowed := false
	for _, next := range adminOrderFlow[order.Status] {
		if next == status {
			allowed = true
		}
	}
	if !allowed {
		return nil, ErrUnprocessable("订单不能从 " + order.Status + " 变更为 " + status)
	}
	if order.PaymentStatus != "paid" {
		return nil, ErrUnprocessable("买家尚未支付，不能开始处理")
	}
	fields := map[string]interface{}{
		"status":     status,
		"tab":        orderTabs[status],
		"steps":      BuildSteps(status, order.CreatedAt),
		"updated_at": time.Now().UTC(),
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(fields)); err != nil {
		return nil, err
	}
	if err := s.appendOrderLog(id, "status", statusText(status, note), operator); err != nil {
		return nil, err
	}
	return s.adminOrder(storeID, id)
}

// AdminOrderCancel 中台取消订单：回补库存与优惠券由买家侧同一套逻辑负责
// 已支付的单本期没有退款能力，只置 refund_status=pending 让商家线下处理
func (s *AdminService) AdminOrderCancel(storeID, id, reason, operator string) (*models.Order, error) {
	order, err := s.adminOrder(storeID, id)
	if err != nil {
		return nil, err
	}
	if _, err := NewOrderService().Cancel(order.MemberID, id); err != nil {
		return nil, err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "门店取消"
	}
	fields := map[string]interface{}{
		"cancel_reason": reason,
		"updated_at":    time.Now().UTC(),
	}
	needRefund := order.PaymentStatus == "paid"
	if needRefund {
		fields["refund_status"] = "pending"
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(fields)); err != nil {
		return nil, err
	}
	note := reason
	if needRefund {
		note += "（已收 " + order.Total + " " + order.Currency + "，需线下退款）"
	}
	if err := s.appendOrderLog(id, "cancel", note, operator); err != nil {
		return nil, err
	}
	return s.adminOrder(storeID, id)
}

// AdminOrderRemark 中台备注，与买家备注分栏保存互不覆盖
func (s *AdminService) AdminOrderRemark(storeID, id, remark, operator string) (*models.Order, error) {
	if _, err := s.adminOrder(storeID, id); err != nil {
		return nil, err
	}
	if len(remark) > 200 {
		return nil, ErrBadRequest("备注最多 200 字")
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(map[string]interface{}{
		"admin_remark": strings.TrimSpace(remark),
		"updated_at":   time.Now().UTC(),
	})); err != nil {
		return nil, err
	}
	if err := s.appendOrderLog(id, "remark", strings.TrimSpace(remark), operator); err != nil {
		return nil, err
	}
	return s.adminOrder(storeID, id)
}

// AdminOrderShipping 配送信息：自配送填骑手，快递填单号
func (s *AdminService) AdminOrderShipping(storeID, id string, req *models.AdminOrderShippingRequest, operator string) (*models.Order, error) {
	order, err := s.adminOrder(storeID, id)
	if err != nil {
		return nil, err
	}
	if order.Status == "cancelled" {
		return nil, ErrUnprocessable("订单已取消，不能再填写配送信息")
	}
	courierName := strings.TrimSpace(req.CourierName)
	courierPhone := strings.TrimSpace(req.CourierPhone)
	trackingNo := strings.TrimSpace(req.TrackingNo)
	fields := map[string]interface{}{
		"courier_name":  courierName,
		"courier_phone": courierPhone,
		"tracking_no":   trackingNo,
		"updated_at":    time.Now().UTC(),
	}
	if err := updateDoc(config.Collections.Orders, id, config.M(fields)); err != nil {
		return nil, err
	}
	parts := make([]string, 0, 2)
	if courierName != "" {
		parts = append(parts, strings.TrimSpace(courierName+" "+courierPhone))
	}
	if trackingNo != "" {
		parts = append(parts, "运单号 "+trackingNo)
	}
	if err := s.appendOrderLog(id, "shipping", strings.Join(parts, "，"), operator); err != nil {
		return nil, err
	}
	return s.adminOrder(storeID, id)
}

// appendOrderLog 追加一条处理留痕：读改写，日志按时间正序展示
func (s *AdminService) appendOrderLog(id, action, note, operator string) error {
	var order models.Order
	if err := findOneDoc(config.Collections.Orders, config.M(map[string]interface{}{"_id": id}), &order); err != nil {
		return err
	}
	logs := append(order.AdminLogs, models.OrderAdminLog{
		Action:   action,
		Note:     note,
		Operator: operator,
		At:       time.Now().UTC().Format(time.RFC3339),
	})
	return updateDoc(config.Collections.Orders, id, config.M(map[string]interface{}{"admin_logs": logs}))
}

// statusText 留痕文案，带上商家填的备注
// accepted 只会从 ready 退回来，所以文案按回退动作写
func statusText(status, note string) string {
	labels := map[string]string{
		"accepted":  "退回待备货",
		"ready":     "备货完成",
		"delivered": "已送达",
	}
	text := labels[status]
	if trimmed := strings.TrimSpace(note); trimmed != "" {
		text += "：" + trimmed
	}
	return text
}
