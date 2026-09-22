// models 数据模型模块
// store.go 门店（商家店铺）域结构：商城数据按 store_id 归属，一个商家账号拥有自己的门店
// 买家账号选中的门店决定它看到的商品、购物车与订单属于哪家店
package models

import "time"

// 门店营业状态
// TODO(商家入驻): 审核流程后期再加，届时补 pending / rejected 并在注册时置为 pending
const (
	StoreStatusOpen   = "open"
	StoreStatusClosed = "closed"
)

// 账号类型：注册时区分买家与商家，商家账号本身仍是买家
const (
	AccountTypeBuyer    = "buyer"
	AccountTypeMerchant = "merchant"
)

// Store 门店文档，OwnerMemberID 即商家账号（会员本身也能下单）
type Store struct {
	ID               string    `bson:"_id,omitempty" json:"id"`
	Name             string    `bson:"name" json:"name"`
	LogoURL          string    `bson:"logo_url,omitempty" json:"logo_url"`
	Description      string    `bson:"description,omitempty" json:"description"`
	Phone            string    `bson:"phone,omitempty" json:"phone"`
	Address          string    `bson:"address,omitempty" json:"address"`
	Longitude        float64   `bson:"longitude" json:"longitude"`
	Latitude         float64   `bson:"latitude" json:"latitude"`
	DeliveryRadiusKM int       `bson:"delivery_radius_km" json:"delivery_radius_km"`
	MinOrderAmount   string    `bson:"min_order_amount" json:"min_order_amount"`
	Notice           string    `bson:"notice,omitempty" json:"notice"`
	Status           string    `bson:"status" json:"status"`
	OwnerMemberID    string    `bson:"owner_member_id" json:"-"`
	CreatedAt        time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt        time.Time `bson:"updated_at" json:"updated_at"`
}

// StoreItem GET /api/shops/nearby 的一行，带与买家的直线距离与可达标记
type StoreItem struct {
	Store
	DistanceMeters int64  `json:"distance_meters"`
	OutOfRange     bool   `json:"out_of_range"`
	Current        bool   `json:"current"`
	DistanceText   string `json:"distance_text"`
}

// NearbyStoreList GET /api/shops/nearby 出参
type NearbyStoreList struct {
	List    []StoreItem `json:"list"`
	Located bool        `json:"located"`
}

// StoreSelectionRequest PUT /api/shop/selection 入参，坐标用于把买家最近一次定位缓存到会员
type StoreSelectionRequest struct {
	StoreID   string  `json:"store_id" binding:"required"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
}

// StoreSelectionData PUT /api/shop/selection 出参
type StoreSelectionData struct {
	StoreID    string `json:"store_id"`
	Name       string `json:"name"`
	OutOfRange bool   `json:"out_of_range"`
}

// StoreProfileRequest 商家编辑自家门店资料，字段为空表示不修改
type StoreProfileRequest struct {
	Name             string  `json:"name"`
	LogoURL          string  `json:"logo_url"`
	Description      string  `json:"description"`
	Phone            string  `json:"phone"`
	Address          string  `json:"address"`
	Longitude        float64 `json:"longitude"`
	Latitude         float64 `json:"latitude"`
	DeliveryRadiusKM int     `json:"delivery_radius_km"`
	MinOrderAmount   string  `json:"min_order_amount"`
	Notice           string  `json:"notice"`
	Status           string  `json:"status"`
}
