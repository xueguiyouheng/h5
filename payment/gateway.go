// payment 支付模块
// gateway.go 支付模块对商城订单域的唯一依赖，由 services 侧实现并在 controllers 接线注入
// 反向依赖由外层完成：本模块不知道订单怎么存，只知道要快照、要回写结果
package payment

// OrderInfo 结算判断所需的订单最小快照
// Total 由本模块规范成两位小数后再与支付单快照比对，adapter 不必预处理
type OrderInfo struct {
	ID            string
	OrderNo       string
	Total         string
	Currency      string
	PaymentStatus string // unpaid / paid / failed
	Tab           string // ongoing / history
}

// Receipt 结算结果，由模块回写订单
// 只允许写支付相关字段，订单 status/tab 状态机不归支付模块管
type Receipt struct {
	Succeeded bool
	Provider  string
	TradeNo   string
	PaidAt    string
}

// OrderGateway 订单域适配器
type OrderGateway interface {
	// Order 按会员维度取订单快照，越权或不存在都回 nil
	Order(memberID, orderID string) (*OrderInfo, error)
	// Settle 把支付结果写回订单，memberID 参与过滤以免跨会员改写
	Settle(memberID, orderID string, receipt Receipt) error
}
