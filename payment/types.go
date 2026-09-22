// payment 支付模块
// types.go 支付域数据结构：支付单文档与出入参契约
// 金额沿用字符串十进制，换算成分只在进渠道那一刻发生
package payment

import "time"

// 支付单状态机：pending -> success / failed / closed，三个终态均不可再迁移
const (
	statusPending = "pending"
	statusSuccess = "success"
	statusFailed  = "failed"
	statusClosed  = "closed"
)

// timeoutReason 超时关单的原因文案
const timeoutReason = "支付超时"

// Payment 支付单文档，_id 即商户侧 out_trade_no
type Payment struct {
	ID             string    `bson:"_id,omitempty" json:"id"`
	OrderID        string    `bson:"order_id" json:"order_id"`
	OrderNo        string    `bson:"order_no" json:"order_no"`
	MemberID       string    `bson:"member_id" json:"-"`
	Provider       string    `bson:"provider" json:"provider"`
	Amount         string    `bson:"amount" json:"amount"`
	Currency       string    `bson:"currency" json:"currency"`
	Status         string    `bson:"status" json:"status"`
	PrepayID       string    `bson:"prepay_id,omitempty" json:"prepay_id"`
	TradeNo        string    `bson:"trade_no,omitempty" json:"trade_no"`
	PayURL         string    `bson:"pay_url,omitempty" json:"pay_url"`
	QRContent      string    `bson:"qr_content,omitempty" json:"qr_content"`
	CreatedAt      time.Time `bson:"created_at" json:"created_at"`
	ExpiredAt      time.Time `bson:"expired_at" json:"expired_at"`
	PaidAt         string    `bson:"paid_at,omitempty" json:"paid_at"`
	FailReason     string    `bson:"fail_reason,omitempty" json:"fail_reason"`
	MockCredential string    `bson:"-" json:"mock_credential,omitempty"`
}

// PrepayRequest POST /api/payment/prepay 入参
type PrepayRequest struct {
	OrderID  string `json:"order_id" binding:"required"`
	Provider string `json:"provider" binding:"required"`
}

// MockNotifyRequest POST /api/payment/mock-notify/:id 入参
// outcome 只接受 success / failed，缺省按 success 处理
type MockNotifyRequest struct {
	Outcome string `json:"outcome"`
}

// LaunchRequest POST /api/payment/launch/:id 入参
// Outcome 仅模拟渠道使用，真实渠道下会被忽略
type LaunchRequest struct {
	Outcome string `json:"outcome"`
}
