// services 业务逻辑层
// payment_gateway.go 支付模块的订单侧适配器
// 支付模块不 import 商城业务层，需要订单信息时走这里；订单的 status/tab 状态机仍由订单域自己管
package services

import (
	"go-gin/config"
	"go-gin/payment"

	"go.mongodb.org/mongo-driver/bson"
)

// PaymentGateway 用订单服务实现 payment.OrderGateway
type PaymentGateway struct {
	orders *OrderService
}

// NewPaymentGateway 创建订单适配器
func NewPaymentGateway() *PaymentGateway {
	return &PaymentGateway{orders: NewOrderService()}
}

// Order 取订单快照，越权或不存在都回 nil，由支付模块判 404
func (g *PaymentGateway) Order(memberID, orderID string) (*payment.OrderInfo, error) {
	order, err := g.orders.ByID(memberID, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, nil
	}
	return &payment.OrderInfo{
		ID:            order.ID,
		OrderNo:       order.OrderNo,
		Total:         order.Total,
		Currency:      order.Currency,
		PaymentStatus: order.PaymentStatus,
		Tab:           order.Tab,
	}, nil
}

// Settle 把支付结果写回订单的新增字段，只碰支付相关列
// memberID 参与过滤，避免跨会员改写；updateDoc 只按 _id 更新，不够用
func (g *PaymentGateway) Settle(memberID, orderID string, receipt payment.Receipt) error {
	if err := checkMongo(); err != nil {
		return err
	}
	fields := map[string]interface{}{}
	if receipt.Succeeded {
		fields["payment_status"] = "paid"
		fields["payment_txn_no"] = receipt.TradeNo
		fields["paid_at"] = receipt.PaidAt
		fields["payment_method"] = receipt.Provider
	} else {
		fields["payment_status"] = "failed"
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Orders).UpdateOne(ctx,
		bson.M{"_id": orderID, "member_id": memberID},
		bson.M{"$set": fields},
	)
	return err
}
