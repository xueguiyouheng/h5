package models

import "time"

// Carousel 首页轮播配置文档
type Carousel struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	StoreID   string    `bson:"store_id,omitempty" json:"store_id,omitempty"`
	Title     string    `bson:"title" json:"title"`
	ImageURL  string    `bson:"image_url" json:"image_url"`
	Link      string    `bson:"link,omitempty" json:"link"`
	Sort      int       `bson:"sort" json:"sort"`
	Status    string    `bson:"status" json:"status"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// CarouselList GET /api/admin/carousel 出参
type CarouselList struct {
	List []Carousel `json:"list"`
}

// CarouselRequest 新增/编辑轮播入参
type CarouselRequest struct {
	Title    string `json:"title" binding:"required"`
	ImageURL string `json:"image_url" binding:"required"`
	Link     string `json:"link"`
	Sort     int    `json:"sort"`
	Status   string `json:"status"`
}

// SubcategoryRequest 子类目入参
type SubcategoryRequest struct {
	ID   string `json:"id"`
	Name string `json:"name" binding:"required"`
	Sort int    `json:"sort"`
}

// CategoryRequest 新增/编辑类目不换；subcategories 为全量替换
type CategoryRequest struct {
	Name          string               `json:"name" binding:"required"`
	ImageURL      string               `json:"image_url"`
	Sort          int                  `json:"sort"`
	Status        string               `json:"status"`
	Subcategories []SubcategoryRequest `json:"subcategories"`
}

// AdminCategory 中台类目视图
type AdminCategory struct {
	ID            string        `json:"id"`
	StoreID       string        `json:"store_id,omitempty"`
	Name          string        `json:"name"`
	ImageURL      string        `json:"image_url"`
	Sort          int           `json:"sort"`
	Status        string        `json:"status"`
	ProductCount  int64         `json:"product_count"`
	Subcategories []Subcategory `json:"subcategories"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// ProductRequest 发品/改品入参
type ProductRequest struct {
	Name          string     `json:"name" binding:"required"`
	Price         string     `json:"price" binding:"required"`
	Currency      string     `json:"currency"`
	Unit          string     `json:"unit"`
	OldPrice      string     `json:"old_price"`
	Badge         string     `json:"badge"`
	ImageURL      string     `json:"image_url" binding:"required"`
	Images        []string   `json:"images"`
	CategoryID    string     `json:"category_id" binding:"required"`
	SubcategoryID string     `json:"subcategory_id"`
	Sections      []string   `json:"sections"`
	Stock         int        `json:"stock"`
	Sort          int        `json:"sort"`
	Status        string     `json:"status"`
	Description   string     `json:"description"`
	Nutrition     *Nutrition `json:"nutrition"`
}

// StatusRequest 上下架入参
type StatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// AdminStats GET /api/admin/stats 出参
type AdminStats struct {
	ProductCount      int64 `json:"product_count"`
	CategoryCount     int64 `json:"category_count"`
	CarouselCount     int64 `json:"carousel_count"`
	OngoingOrderCount int64 `json:"ongoing_order_count"`
}

// ---------- 订单处理 ----------

// AdminOrderSummary GET /api/admin/orders/summary 出参，本店各状态计数
type AdminOrderSummary struct {
	All       int64 `json:"all"`
	Unpaid    int64 `json:"unpaid"`
	Accepted  int64 `json:"accepted"`
	Ready     int64 `json:"ready"`
	Delivered int64 `json:"delivered"`
	Cancelled int64 `json:"cancelled"`
	TodayNew  int64 `json:"today_new"`
	// TodayPaidAmount 今日已支付订单金额合计，字符串十进制
	TodayPaidAmount string `json:"today_paid_amount"`
	Currency        string `json:"currency"`
}

// AdminOrderPayment 订单详情中的支付单视图，bson 字段与 payments 集合对齐
type AdminOrderPayment struct {
	ID         string    `bson:"_id" json:"id"`
	Provider   string    `bson:"provider" json:"provider"`
	Amount     string    `bson:"amount" json:"amount"`
	Currency   string    `bson:"currency" json:"currency"`
	Status     string    `bson:"status" json:"status"`
	TradeNo    string    `bson:"trade_no,omitempty" json:"trade_no"`
	CreatedAt  time.Time `bson:"created_at" json:"created_at"`
	PaidAt     string    `bson:"paid_at,omitempty" json:"paid_at"`
	FailReason string    `bson:"fail_reason,omitempty" json:"fail_reason"`
}

// AdminOrderDetail GET /api/admin/orders/{id} 出参：订单原文 + 联表信息 + 支付单
type AdminOrderDetail struct {
	Order
	Payments []AdminOrderPayment `json:"payments"`
}

// AdminOrderStatusRequest PUT /api/admin/orders/{id}/status 入参
type AdminOrderStatusRequest struct {
	Status string `json:"status" binding:"required"`
	Note   string `json:"note"`
}

// AdminOrderCancelRequest POST /api/admin/orders/{id}/cancel 入参
type AdminOrderCancelRequest struct {
	Reason string `json:"reason"`
}

// AdminOrderRemarkRequest PUT /api/admin/orders/{id}/remark 入参
type AdminOrderRemarkRequest struct {
	AdminRemark string `json:"admin_remark"`
}

// AdminOrderShippingRequest PUT /api/admin/orders/{id}/shipping 入参
type AdminOrderShippingRequest struct {
	CourierName  string `json:"courier_name"`
	CourierPhone string `json:"courier_phone"`
	TrackingNo   string `json:"tracking_no"`
}
