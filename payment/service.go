// payment 支付模块
// service.go 支付单状态机：建单、查询、结算收敛
// 渠道差异全部走 provider，本文件不出现任何渠道专属字段；订单侧只认 OrderGateway
// 支付结果只写订单新增字段，订单 status/tab 状态机与库存/券回补逻辑不受影响
// 契约与切换步骤见 docs/payment-integration.md
package payment

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

// Service 支付业务服务
type Service struct {
	orders OrderGateway
}

// NewService 创建支付服务，orders 由外层注入（本模块不 import 商城业务层）
func NewService(orders OrderGateway) *Service {
	return &Service{orders: orders}
}

// Prepay 为待支付订单建支付单
// 同一订单同一渠道存在未过期的 pending 单时直接复用，避免用户重复拉起收银台产生多笔
// 复用只限同一 provider：换渠道必须重新预下单，否则收银台素材与渠道对不上
func (s *Service) Prepay(memberID, orderID, provider string) (*Payment, error) {
	if err := checkStore(); err != nil {
		return nil, err
	}
	prov, ok := providerFor(provider)
	if !ok {
		return nil, ErrBadRequest("支付方式只支持支付宝或微信")
	}
	order, err := s.orders.Order(memberID, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, ErrNotFound("订单不存在")
	}
	if order.PaymentStatus == "paid" {
		return nil, ErrConflict("该订单已支付")
	}
	if order.Tab != "ongoing" {
		return nil, ErrUnprocessable("该订单已结束，无法发起支付")
	}
	pending, err := s.pendingOf(orderID, provider)
	if err != nil {
		return nil, err
	}
	if pending != nil {
		return s.decorate(pending), nil
	}
	amount := normalizePrice(order.Total)
	if priceValue(amount) <= 0 {
		return nil, ErrUnprocessable("订单金额异常，无法发起支付")
	}

	now := time.Now().UTC()
	payment := &Payment{
		ID:        newID(),
		OrderID:   order.ID,
		OrderNo:   order.OrderNo,
		MemberID:  memberID,
		Provider:  provider,
		Amount:    amount,
		Currency:  firstNonEmpty(order.Currency, "USD"),
		Status:    statusPending,
		CreatedAt: now,
		ExpiredAt: now.Add(Expire),
	}
	// 先向渠道预下单拿到收银台素材，成功后才落库，避免留下一笔无法支付的空单
	ctx, cancel := context.WithTimeout(context.Background(), payHTTPTimeout)
	defer cancel()
	pre, err := prov.Prepay(ctx, payment)
	if err != nil {
		return nil, ErrUnprocessable(err.Error())
	}
	payment.PrepayID = pre.PrepayID
	payment.PayURL = pre.PayURL
	payment.QRContent = pre.QRContent
	if err := insertDoc(payment); err != nil {
		return nil, err
	}
	return s.decorate(payment), nil
}

// Get 取会员名下支付单
// pending 单先做两件事：超时则向渠道关单并本地置 closed；真实渠道下再主动查一次单，
// 补掉「渠道已收款但回调没到」的窗口，前端只轮询本接口即可拿到最终结果
func (s *Service) Get(memberID, id string) (*Payment, error) {
	payment, err := s.raw(memberID, id)
	if err != nil {
		return nil, err
	}
	if payment == nil {
		return nil, ErrNotFound("支付单不存在")
	}
	if payment.Status != statusPending {
		return s.decorate(payment), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), payHTTPTimeout)
	defer cancel()
	if !payment.ExpiredAt.After(time.Now().UTC()) {
		s.closeAtChannel(ctx, payment)
		if err := closeDoc(payment.ID); err != nil {
			return nil, err
		}
		payment.Status = statusClosed
		payment.FailReason = timeoutReason
		return s.decorate(payment), nil
	}
	if !UseMock() {
		if err := s.reconcile(ctx, payment); err != nil {
			return nil, err
		}
	}
	return s.decorate(payment), nil
}

// MockNotify 模拟渠道回调，仅在 PAY_PROVIDER=mock 下有意义
// 幂等：重复回调只会在第一次改动支付单与订单，之后回放既有结果
// 真实渠道下结算走 Notify，两者共用 settle 这一段，业务规则完全一致
func (s *Service) MockNotify(memberID, id, outcome string) (*Payment, error) {
	if err := checkStore(); err != nil {
		return nil, err
	}
	if !UseMock() {
		return nil, ErrUnprocessable("真实支付渠道下不支持前端模拟回调")
	}
	payment, err := s.Get(memberID, id)
	if err != nil {
		return nil, err
	}
	if payment.Status == statusSuccess {
		return payment, nil
	}
	if payment.Status != statusPending {
		return nil, ErrUnprocessable("支付单已关闭，请重新发起支付")
	}
	succeeded := outcome != "failed"
	tradeNo := ""
	if succeeded {
		tradeNo = mockTradeNo(payment.Provider, payment.ID)
	}
	// 模拟报文与真实回调同构：金额取本地快照，由 settle 与订单快照互相复核
	return s.settle(payment, &NotifyResult{
		Provider:   payment.Provider,
		OutTradeNo: payment.ID,
		TradeNo:    tradeNo,
		Amount:     payment.Amount,
		Paid:       succeeded,
	})
}

// Launch 取唤起指令
// 先过 Get 是为了复用「超时关单 + 真实渠道主动查单」这段收敛，再让渠道按端环境决定怎么拉起
func (s *Service) Launch(memberID, id string, env LaunchEnv) (*Launch, error) {
	if err := checkStore(); err != nil {
		return nil, err
	}
	payment, err := s.Get(memberID, id)
	if err != nil {
		return nil, err
	}
	if payment.Status == statusSuccess {
		return nil, ErrConflict("该订单已支付")
	}
	if payment.Status != statusPending {
		return nil, ErrUnprocessable("支付单已关闭，请重新发起支付")
	}
	prov, ok := providerFor(payment.Provider)
	if !ok {
		return nil, ErrBadRequest("支付渠道不支持")
	}
	ctx, cancel := context.WithTimeout(context.Background(), payHTTPTimeout)
	defer cancel()
	launch, err := prov.Launch(ctx, payment, env)
	if err != nil {
		return nil, ErrUnprocessable(err.Error())
	}
	return launch, nil
}

// MockReturn 模拟渠道的唤起落点：浏览器整页跳进来，没有会话上下文，
// 因此和公网回调一样按 out_trade_no（支付单 _id）定位，走同一条 settle，最后给出回跳地址
// 重复回跳幂等：已是终态就直接回结果页，不再动单
func (s *Service) MockReturn(id, outcome string) (string, error) {
	if err := checkStore(); err != nil {
		return "", err
	}
	if !UseMock() {
		return "", ErrBadRequest("真实支付渠道下不支持模拟唤起")
	}
	payment, err := s.rawByID(id)
	if err != nil {
		return "", err
	}
	if payment == nil {
		return "", ErrNotFound("支付单不存在")
	}
	resultURL := Channels.Mock.ResultURL + "?payment_id=" + url.QueryEscape(payment.ID)
	if payment.Status != statusPending {
		return resultURL, nil
	}
	if !payment.ExpiredAt.After(time.Now().UTC()) {
		if err := closeDoc(payment.ID); err != nil {
			return "", err
		}
		return resultURL, nil
	}
	succeeded := outcome != "failed"
	tradeNo := ""
	if succeeded {
		tradeNo = mockTradeNo(payment.Provider, payment.ID)
	}
	if _, err := s.settle(payment, &NotifyResult{
		Provider:   payment.Provider,
		OutTradeNo: payment.ID,
		TradeNo:    tradeNo,
		Amount:     payment.Amount,
		Paid:       succeeded,
		State:      "MOCK_RETURN",
	}); err != nil {
		return "", err
	}
	return resultURL, nil
}

// Notify 处理渠道公网回调：解析验签 → 定位支付单 → 共用结算
// 无会话无会员上下文，一切以渠道报文里的 out_trade_no 为准，金额不符绝不信
func (s *Service) Notify(providerName string, req *http.Request) error {
	if err := checkStore(); err != nil {
		return err
	}
	prov, ok := providerFor(providerName)
	if !ok {
		return ErrBadRequest("支付渠道不支持")
	}
	n, err := prov.ParseNotify(req)
	if err != nil {
		return err
	}
	if n.Provider == "" || n.Provider != providerName {
		return ErrUnprocessable("回调渠道与报文来源不一致")
	}
	payment, err := s.rawByID(n.OutTradeNo)
	if err != nil {
		return err
	}
	if payment == nil {
		return ErrNotFound("支付单不存在")
	}
	if payment.Provider != providerName {
		return ErrUnprocessable("支付单渠道与回调渠道不一致")
	}
	if n.Amount != "" && n.Amount != payment.Amount {
		return ErrUnprocessable("回调金额与支付单快照不一致")
	}
	if payment.Status != statusPending {
		return nil
	}
	_, err = s.settle(payment, n)
	return err
}

// reconcile 用渠道查单结果收敛本地状态，查不到或状态未定都保持 pending
func (s *Service) reconcile(ctx context.Context, payment *Payment) error {
	prov, ok := providerFor(payment.Provider)
	if !ok {
		return nil
	}
	n, err := prov.Query(ctx, payment)
	if err != nil || n == nil {
		return nil
	}
	if payment.Status != statusPending {
		return nil
	}
	if _, err := s.settle(payment, n); err != nil {
		return err
	}
	latest, err := s.raw(payment.MemberID, payment.ID)
	if err != nil {
		return err
	}
	if latest != nil {
		*payment = *latest
	}
	return nil
}

// closeAtChannel 本地判超时的同时让渠道也关单，失败不影响本地状态推进
func (s *Service) closeAtChannel(ctx context.Context, payment *Payment) {
	prov, ok := providerFor(payment.Provider)
	if !ok || UseMock() {
		return
	}
	_ = prov.Close(ctx, payment)
}

// settle 结算收敛：条件更新只允许 pending 迁移一次，成功再写回订单
// 三条入口（模拟回调、公网回调、主动查单）都汇到这里，金额复核与幂等只做这一份
func (s *Service) settle(payment *Payment, n *NotifyResult) (*Payment, error) {
	order, err := s.orders.Order(payment.MemberID, payment.OrderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, ErrNotFound("订单不存在")
	}
	// 渠道报文与订单快照必须双向对上才认收款
	if normalizePrice(order.Total) != payment.Amount {
		return nil, ErrUnprocessable("支付金额与订单金额不一致")
	}
	receipt := Receipt{Succeeded: n.Paid, Provider: payment.Provider, TradeNo: n.TradeNo}
	if n.Paid {
		receipt.PaidAt = firstNonEmpty(n.PaidAt, time.Now().UTC().Format(time.RFC3339))
	}
	reason := ""
	if !n.Paid {
		reason = firstNonEmpty(n.State, "用户支付失败")
	}
	changed, err := settleDoc(payment.ID, n.Paid, n.TradeNo, receipt.PaidAt, reason)
	if err != nil {
		return nil, err
	}
	if changed {
		if err := s.orders.Settle(payment.MemberID, payment.OrderID, receipt); err != nil {
			return nil, err
		}
	}
	latest, err := s.raw(payment.MemberID, payment.ID)
	if err != nil {
		return nil, err
	}
	if latest == nil {
		return nil, ErrNotFound("支付单不存在")
	}
	return s.decorate(latest), nil
}

// raw 按会员维度取支付单，越权访问回 nil
func (s *Service) raw(memberID, id string) (*Payment, error) {
	var payment Payment
	if err := findOneDoc(map[string]interface{}{
		"_id":       id,
		"member_id": memberID,
	}, &payment); err != nil {
		return nil, err
	}
	if payment.ID == "" {
		return nil, nil
	}
	return &payment, nil
}

// rawByID 公网回调没有会员上下文，只能按 out_trade_no（即支付单 _id）定位
func (s *Service) rawByID(id string) (*Payment, error) {
	var payment Payment
	if err := findOneDoc(map[string]interface{}{"_id": id}, &payment); err != nil {
		return nil, err
	}
	if payment.ID == "" {
		return nil, nil
	}
	return &payment, nil
}

// pendingOf 取订单下同一渠道、未过期的待支付单
func (s *Service) pendingOf(orderID, provider string) (*Payment, error) {
	var payment Payment
	if err := findOneDoc(map[string]interface{}{
		"order_id":   orderID,
		"provider":   provider,
		"status":     statusPending,
		"expired_at": map[string]interface{}{"$gt": time.Now().UTC()},
	}, &payment); err != nil {
		return nil, err
	}
	if payment.ID == "" {
		return nil, nil
	}
	return &payment, nil
}

// decorate 补齐不落库的展示字段，真实渠道下 MockCredential 恒为空
func (s *Service) decorate(payment *Payment) *Payment {
	if payment == nil {
		return nil
	}
	payment.MockCredential = Credential(payment.Provider)
	return payment
}
