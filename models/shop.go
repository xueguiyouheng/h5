// models 数据模型模块
// shop.go 店铺与商品相关结构：同时作为 MongoDB 文档与接口出参
// 金额统一为字符串十进制 + currency + unit，展示文案由前端拼接
package models

import "time"

// Subcategory 类目子项，独立集合，按 category_id 归属
type Subcategory struct {
	ID         string `bson:"_id,omitempty" json:"id"`
	CategoryID string `bson:"category_id" json:"category_id"`
	Name       string `bson:"name" json:"name"`
	Sort       int    `bson:"sort" json:"sort"`
}

// Category 一级类目
type Category struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	StoreID   string    `bson:"store_id,omitempty" json:"store_id,omitempty"`
	Name      string    `bson:"name" json:"name"`
	ImageURL  string    `bson:"image_url" json:"image_url"`
	Sort      int       `bson:"sort" json:"sort"`
	Status    string    `bson:"status" json:"status"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`

	Subcategories []Subcategory `bson:"-" json:"subcategories,omitempty"`
	ProductCount  int64         `bson:"-" json:"product_count"`
}

// CategoryView 前台类目条目（label 语义与前端保持兼容）
type CategoryView struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Name          string   `json:"name"`
	ImageURL      string   `json:"image_url"`
	ProductCount  int64    `json:"product_count"`
	Subcategories []string `json:"subcategories"`
}

// Nutrition 营养成分
type Nutrition struct {
	Calories int    `bson:"calories" json:"calories"`
	Per      string `bson:"per" json:"per"`
}

// Product 商品文档
type Product struct {
	ID string `bson:"_id,omitempty" json:"id"`
	// StoreID 商品归属门店，中台写入时强制为运营账号自己的门店
	StoreID         string    `bson:"store_id,omitempty" json:"store_id,omitempty"`
	Name            string    `bson:"name" json:"name"`
	Price           string    `bson:"price" json:"price"`
	Currency        string    `bson:"currency" json:"currency"`
	Unit            string    `bson:"unit" json:"unit"`
	OldPrice        string    `bson:"old_price,omitempty" json:"old_price,omitempty"`
	Badge           string    `bson:"badge,omitempty" json:"badge,omitempty"`
	ImageURL        string    `bson:"image_url" json:"image_url"`
	Images          []string  `bson:"images,omitempty" json:"images"`
	Description     string    `bson:"description,omitempty" json:"description"`
	Nutrition       Nutrition `bson:"nutrition" json:"nutrition"`
	Stock           int       `bson:"stock" json:"stock"`
	Sales           int       `bson:"sales" json:"sales"`
	CategoryID      string    `bson:"category_id" json:"category_id"`
	SubcategoryID   string    `bson:"subcategory_id,omitempty" json:"subcategory_id,omitempty"`
	SubcategoryName string    `bson:"subcategory_name,omitempty" json:"subcategory_name,omitempty"`
	Sections        []string  `bson:"sections,omitempty" json:"sections"`
	Sort            int       `bson:"sort" json:"sort"`
	Status          string    `bson:"status" json:"status"`
	CreatedAt       time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time `bson:"updated_at" json:"updated_at"`
}

// ProductCard 列表卡片视图，只带列表页需要的字段
type ProductCard struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Price     string `json:"price"`
	Currency  string `json:"currency"`
	Unit      string `json:"unit"`
	ImageURL  string `json:"image_url"`
	Badge     string `json:"badge,omitempty"`
	OldPrice  string `json:"old_price,omitempty"`
	Collected bool   `json:"collected"`
	// Stock 让收藏这类「直接加购」的列表能提前标出售罄，不必等接口报 422
	Stock int `json:"stock"`
	// StoreID 商品归属门店：收藏这类跨店列表靠它让前端在加购前自动切到对应门店
	StoreID string `json:"store_id,omitempty"`
}

// CardView 由商品文档投影出列表卡片
func (p *Product) CardView() ProductCard {
	return ProductCard{
		ID:       p.ID,
		Name:     p.Name,
		Price:    p.Price,
		Currency: p.Currency,
		Unit:     p.Unit,
		ImageURL: p.ImageURL,
		Badge:    p.Badge,
		OldPrice: p.OldPrice,
		Stock:    p.Stock,
		StoreID:  p.StoreID,
	}
}

// CardViews 批量投影，空列表返回 []ProductCard{} 以序列化成 JSON 数组
func CardViews(list []Product) []ProductCard {
	return CardViewsCollected(list, nil)
}

// CardViewsCollected 批量投影并标出会员已收藏的商品，collected 为 nil 时全按未收藏
func CardViewsCollected(list []Product, collected map[string]bool) []ProductCard {
	out := make([]ProductCard, 0, len(list))
	for i := range list {
		card := list[i].CardView()
		card.Collected = collected[list[i].ID]
		out = append(out, card)
	}
	return out
}

// HomeSection 首页运营版块
type HomeSection struct {
	Key   string        `json:"key"`
	Title string        `json:"title"`
	Items []ProductCard `json:"items"`
}

// HomeStore 首页顶部的当前门店快照，买家一切数据都锁在这家店上
type HomeStore struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	LogoURL        string `json:"logo_url,omitempty"`
	Address        string `json:"address,omitempty"`
	Phone          string `json:"phone,omitempty"`
	Notice         string `json:"notice,omitempty"`
	Status         string `json:"status"`
	MinOrderAmount string `json:"min_order_amount,omitempty"`
	DistanceText   string `json:"distance_text,omitempty"`
	OutOfRange     bool   `json:"out_of_range"`
}

// Greeting 首页问候语
type Greeting struct {
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// HomeData GET /api/shop/home 出参
type HomeData struct {
	Greeting Greeting `json:"greeting"`
	// Store 为 nil 表示这个环境还没有门店，前端隐藏切店入口
	Store     *HomeStore    `json:"store,omitempty"`
	Carousel  []Carousel    `json:"carousel"`
	Sections  []HomeSection `json:"sections"`
	Recommend PageResult    `json:"recommend"`
}

// ProductDetail GET /api/shop/products/{id} 出参
type ProductDetail struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Price        string    `json:"price"`
	Currency     string    `json:"currency"`
	Unit         string    `json:"unit"`
	OldPrice     string    `json:"old_price,omitempty"`
	Badge        string    `json:"badge,omitempty"`
	HeroImageURL string    `json:"hero_image_url"`
	ImageURL     string    `json:"image_url"`
	Images       []string  `json:"images"`
	Description  string    `json:"description"`
	Nutrition    Nutrition `json:"nutrition"`
	Stock        int       `json:"stock"`
	CategoryID   string    `json:"category_id"`
	Collected    bool      `json:"collected"`
	// StoreID 商品归属门店：详情可以直接从收藏或分享链接打开，前端靠它在加购前切到对应门店
	StoreID string        `json:"store_id,omitempty"`
	Related []ProductCard `json:"related"`
}

// SearchHotData GET /api/shop/search/hot 出参
type SearchHotData struct {
	Keywords   []string       `json:"keywords"`
	Categories []CategoryView `json:"categories"`
}
