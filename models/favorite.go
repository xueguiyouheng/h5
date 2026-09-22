// models 数据模型模块
// favorite.go 商品收藏：一条文档就是一个「会员 × 商品」关系，唯一索引挡住重复收藏
package models

import "time"

// Favorite 会员收藏的商品
type Favorite struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	MemberID  string    `bson:"member_id" json:"member_id"`
	ProductID string    `bson:"product_id" json:"product_id"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// FavoriteRequest POST /api/shop/favorites 入参
type FavoriteRequest struct {
	ProductID string `json:"product_id" binding:"required"`
}

// FavoriteResult 收藏切换出参：collected 是切换后的状态，count 给入口角标用
type FavoriteResult struct {
	ProductID string `json:"product_id"`
	Collected bool   `json:"collected"`
	Count     int64  `json:"count"`
}

// FavoriteRemoveRequest DELETE /api/shop/favorites 入参，收藏页多选后批量取消
type FavoriteRemoveRequest struct {
	ProductIDs []string `json:"product_ids" binding:"required"`
}

// FavoriteRemoveResult 批量取消出参：removed 是真正删掉的条数，count 是剩余收藏数
type FavoriteRemoveResult struct {
	Removed int64 `json:"removed"`
	Count   int64 `json:"count"`
}
