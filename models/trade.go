// models 数据模型模块
// trade.go 交易域结构：购物车、优惠券、收货地址、订单
// 金额一律服务端计算并以字符串十进制返回
package models

import "time"

// CartLine 购物车行项目（持久化字段）
// StoreID 是加购时从商品快照下来的门店，一单一店靠它把不同门店的行隔开
type CartLine struct {
	ProductID string `bson:"product_id" json:"product_id"`
	StoreID   string `bson:"store_id,omitempty" json:"-"`
	Qty       int    `bson:"qty" json:"qty"`
	Selected  bool   `bson:"selected" json:"selected"`
}

// Cart 购物车文档，一位会员一行
type Cart struct {
	ID        string     `bson:"_id,omitempty" json:"-"`
	MemberID  string     `bson:"member_id" json:"-"`
	Lines     []CartLine `bson:"lines" json:"-"`
	UpdatedAt time.Time  `bson:"updated_at" json:"-"`
}

// CartItem 购物车条目视图（联表商品后的出参）
type CartItem struct {
	ID        string `json:"id"`
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	Price     string `json:"price"`
	Currency  string `json:"currency"`
	Unit      string `json:"unit"`
	ImageURL  string `json:"image_url"`
	Qty       int    `json:"qty"`
	Selected  bool   `json:"selected"`
	LineTotal string `json:"line_total"`
	MaxQty    int    `json:"max_qty"`
	Available int    `json:"available"`
}

// CartData GET /api/cart 出参
type CartData struct {
	Items                 []CartItem `json:"items"`
	Currency              string     `json:"currency"`
	SelectedTotal         string     `json:"selected_total"`
	Subtotal              string     `json:"subtotal"`
	DeliveryFee           string     `json:"delivery_fee"`
	FreeDeliveryThreshold string     `json:"free_delivery_threshold"`
	Discount              string     `json:"discount"`
	Payable               string     `json:"payable"`
	AppliedVoucherID      string     `json:"applied_voucher_id"`
}

// AddToCartRequest POST /api/cart/items 入参
type AddToCartRequest struct {
	ProductID string `json:"product_id" binding:"required"`
	Qty       int    `json:"qty"`
}

// CartAddItem 批量加购的一条
type CartAddItem struct {
	ProductID string `json:"product_id" binding:"required"`
	Qty       int    `json:"qty"`
}

// AddManyToCartRequest POST /api/cart/items/batch 入参，收藏页「一键加入购物车」用
type AddManyToCartRequest struct {
	Items []CartAddItem `json:"items" binding:"required"`
}

// SetQtyRequest PATCH /api/cart/items/{id} 入参，qty<=0 视为删除
type SetQtyRequest struct {
	Qty int `json:"qty"`
}

// CartSelectionRequest PUT /api/cart/selection 入参
// all 为 true 时全选；否则按 item_ids 勾选，item_ids 为空表示全部取消勾选
type CartSelectionRequest struct {
	All     *bool    `json:"all"`
	ItemIDs []string `json:"item_ids"`
}

// LanguageRequest PUT /api/settings 入参
type LanguageRequest struct {
	Language string `json:"language" binding:"required"`
}

// CheckoutPreviewRequest POST /api/cart/checkout-preview 入参
type CheckoutPreviewRequest struct {
	AddressID string   `json:"address_id"`
	VoucherID string   `json:"voucher_id"`
	ItemIDs   []string `json:"item_ids"`
}

// CheckoutPreview POST /api/cart/checkout-preview 出参
type CheckoutPreview struct {
	CartData
	Address               *Address `json:"address,omitempty"`
	ETA                   string   `json:"eta,omitempty"`
	VoucherRejectedReason string   `json:"voucher_rejected_reason,omitempty"`
}

// Voucher 优惠券文档
type Voucher struct {
	ID          string    `bson:"_id,omitempty" json:"id"`
	MemberID    string    `bson:"member_id" json:"-"`
	Title       string    `bson:"title" json:"title"`
	Kind        string    `bson:"kind" json:"kind"`
	Value       int       `bson:"value" json:"value"`
	MinSpend    string    `bson:"min_spend" json:"min_spend"`
	Description string    `bson:"description" json:"description"`
	ExpiredAt   string    `bson:"expired_at" json:"expired_at"`
	Source      string    `bson:"source" json:"source"`
	RedeemCode  string    `bson:"redeem_code,omitempty" json:"redeem_code,omitempty"`
	Used        bool      `bson:"used" json:"used"`
	CreatedAt   time.Time `bson:"created_at" json:"created_at"`

	Usable    bool   `bson:"-" json:"usable"`
	GapAmount string `bson:"-" json:"gap_amount"`
}

// VoucherList GET /api/vouchers 出参
type VoucherList struct {
	List []Voucher `json:"list"`
}

// RedeemRequest POST /api/vouchers/redeem 入参
type RedeemRequest struct {
	Code string `json:"code" binding:"required"`
}

// RedeemCode 兑换码模板
type RedeemCode struct {
	Code         string `bson:"_id" json:"code"`
	Kind         string `bson:"kind" json:"kind"`
	Value        int    `bson:"value" json:"value"`
	MinSpend     string `bson:"min_spend" json:"min_spend"`
	Description  string `bson:"description" json:"description"`
	ValidityDays int    `bson:"validity_days" json:"validity_days"`
}

// Address 收货地址文档
type Address struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	MemberID  string    `bson:"member_id" json:"-"`
	Label     string    `bson:"label" json:"label"`
	Detail    string    `bson:"detail" json:"detail"`
	IsDefault bool      `bson:"is_default" json:"is_default"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// AddressList GET /api/addresses 出参
type AddressList struct {
	List      []Address `json:"list"`
	DefaultID string    `json:"default_id"`
}

// AddressRequest 新增/编辑地址入参
type AddressRequest struct {
	Label     string `json:"label"`
	Detail    string `json:"detail"`
	AsDefault bool   `json:"as_default"`
}

// OrderItem 订单行项目快照
type OrderItem struct {
	ProductID string `bson:"product_id" json:"product_id"`
	Name      string `bson:"name" json:"name"`
	ImageURL  string `bson:"image_url" json:"image_url"`
	UnitPrice string `bson:"unit_price" json:"unit_price"`
	Qty       int    `bson:"qty" json:"qty"`
	LineTotal string `bson:"line_total" json:"line_total"`
}

// OrderStep 订单轨迹节点
type OrderStep struct {
	Code  string `bson:"code" json:"code"`
	Label string `bson:"label" json:"label"`
	At    string `bson:"at" json:"at"`
	Done  bool   `bson:"done" json:"done"`
}

// OrderAdminLog 中台操作留痕：推进状态、取消、备注、配送信息都记一条
type OrderAdminLog struct {
	Action   string `bson:"action" json:"action"`
	Note     string `bson:"note,omitempty" json:"note,omitempty"`
	Operator string `bson:"operator,omitempty" json:"operator,omitempty"`
	At       string `bson:"at" json:"at"`
}

// Order 订单文档
// 门店与收货人信息在建单时快照，之后买家改地址或门店改名都不影响历史订单
type Order struct {
	ID            string      `bson:"_id,omitempty" json:"id"`
	OrderNo       string      `bson:"order_no" json:"order_no"`
	MemberID      string      `bson:"member_id" json:"-"`
	StoreID       string      `bson:"store_id,omitempty" json:"store_id,omitempty"`
	StoreName     string      `bson:"store_name,omitempty" json:"store_name,omitempty"`
	AddressID     string      `bson:"address_id" json:"address_id"`
	AddressLabel  string      `bson:"address_label" json:"address_label"`
	AddressDetail string      `bson:"address_detail,omitempty" json:"address_detail,omitempty"`
	Receiver      string      `bson:"receiver,omitempty" json:"receiver,omitempty"`
	ReceiverPhone string      `bson:"receiver_phone,omitempty" json:"receiver_phone,omitempty"`
	Status        string      `bson:"status" json:"status"`
	Tab           string      `bson:"tab" json:"tab"`
	Items         []OrderItem `bson:"items" json:"items"`
	Currency      string      `bson:"currency" json:"currency"`
	Subtotal      string      `bson:"subtotal" json:"subtotal"`
	Discount      string      `bson:"discount" json:"discount"`
	DeliveryFee   string      `bson:"delivery_fee" json:"delivery_fee"`
	Total         string      `bson:"total" json:"total"`
	VoucherID     string      `bson:"voucher_id,omitempty" json:"voucher_id"`
	PaymentMethod string      `bson:"payment_method,omitempty" json:"payment_method"`
	// 支付结果以新增字段回写，status/tab 状态机不受影响
	PaymentStatus string      `bson:"payment_status" json:"payment_status"`
	PaymentTxnNo  string      `bson:"payment_txn_no,omitempty" json:"payment_txn_no,omitempty"`
	PaidAt        string      `bson:"paid_at,omitempty" json:"paid_at,omitempty"`
	ETA           string      `bson:"eta,omitempty" json:"eta"`
	Steps         []OrderStep `bson:"steps" json:"steps"`
	Remark        string      `bson:"remark,omitempty" json:"remark,omitempty"`
	// 中台处理订单时补写的字段，买家侧只读
	AdminRemark  string          `bson:"admin_remark,omitempty" json:"admin_remark,omitempty"`
	CourierName  string          `bson:"courier_name,omitempty" json:"courier_name,omitempty"`
	CourierPhone string          `bson:"courier_phone,omitempty" json:"courier_phone,omitempty"`
	TrackingNo   string          `bson:"tracking_no,omitempty" json:"tracking_no,omitempty"`
	CancelReason string          `bson:"cancel_reason,omitempty" json:"cancel_reason,omitempty"`
	RefundStatus string          `bson:"refund_status,omitempty" json:"refund_status,omitempty"`
	AdminLogs    []OrderAdminLog `bson:"admin_logs,omitempty" json:"admin_logs,omitempty"`
	CreatedAt    time.Time       `bson:"created_at" json:"date"`

	// 以下字段只在出参中出现，由中台查询时联表回填
	MemberName   string `bson:"-" json:"member_name,omitempty"`
	MemberMobile string `bson:"-" json:"member_mobile,omitempty"`
}

// CreateOrderRequest POST /api/orders 入参
type CreateOrderRequest struct {
	AddressID     string   `json:"address_id"`
	VoucherID     string   `json:"voucher_id"`
	ItemIDs       []string `json:"item_ids"`
	PaymentMethod string   `json:"payment_method"`
	Remark        string   `json:"remark"`
}

// CreateOrderResult POST /api/orders 出参
type CreateOrderResult struct {
	ID      string `json:"id"`
	OrderNo string `json:"order_no"`
	Status  string `json:"status"`
	Payable string `json:"payable"`
}

// OrderTrack GET /api/orders/{id}/track 出参
type OrderTrack struct {
	ID      string      `json:"id"`
	Status  string      `json:"status"`
	Steps   []OrderStep `json:"steps"`
	ETA     string      `json:"eta,omitempty"`
	Courier interface{} `json:"courier,omitempty"`
}
