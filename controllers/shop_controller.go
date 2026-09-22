// controllers 控制层
// shop_controller.go 店铺与商品：首页聚合、类目、商品列表、收藏、详情
package controllers

import (
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// ShopController 店铺控制器
type ShopController struct {
	shop *services.ShopService
}

// NewShopController 创建店铺控制器实例
func NewShopController() *ShopController {
	return &ShopController{shop: services.NewShopService()}
}

// Home 首页聚合数据
// @Summary 首页聚合（问候/轮播/运营版块/推荐分页）
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param recommend_page query int false "推荐流页码，默认 1"
// @Param recommend_page_size query int false "推荐流每页，默认 10"
// @Success 200 {object} models.ApiResponse{data=models.HomeData}
// @Router /api/shop/home [get]
func (c *ShopController) Home(ctx *gin.Context) {
	member, err := currentMember(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.shop.Home(member, queryInt(ctx, "recommend_page", 1), queryInt(ctx, "recommend_page_size", 10))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Carousel 首页轮播
// @Summary 首页轮播图列表（当前门店，仅启用项，按 sort 倒序）
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.CarouselList}
// @Router /api/shop/carousel [get]
func (c *ShopController) Carousel(ctx *gin.Context) {
	storeID, _, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.shop.Carousel(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Categories 类目分页
// @Summary 一级类目列表（当前门店）
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 8"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/shop/categories [get]
func (c *ShopController) Categories(ctx *gin.Context) {
	storeID, _, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	page, size := pageParam(ctx, 8)
	data, err := c.shop.Categories(page, size, storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Category 类目元信息（名称与子类目 tab），类目下的商品走 /shop/products?category_id=
// @Summary 类目详情
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param category_id path string true "类目 ID"
// @Success 200 {object} models.ApiResponse{data=models.CategoryView}
// @Failure 404 {object} models.ApiResponse "类目不存在"
// @Router /api/shop/categories/{category_id} [get]
func (c *ShopController) Category(ctx *gin.Context) {
	storeID, _, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.shop.CategoryDetail(ctx.Param("category_id"), storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Products 商品列表唯一入口：搜索、类目、版块、收藏都只是过滤字段不同
// @Summary 商品列表（搜索 / 类目 / 版块 / 收藏共用）
// @Description q 关键词、category_id+subcategory 类目、section 运营版块、favorite=true 只回会员收藏的商品
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param q query string false "关键词，匹配商品名与描述"
// @Param category_id query string false "类目 ID"
// @Param subcategory query string false "子类目名称"
// @Param section query string false "运营版块 exclusive_offer / best_selling / recommend"
// @Param favorite query bool false "true 时只回当前会员收藏过的商品"
// @Param sort query string false "sales 按销量倒序，留空按运营排序"
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 10"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/shop/products [get]
func (c *ShopController) Products(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	page, size := pageParam(ctx, 10)
	data, err := c.shop.ListProducts(services.ProductQuery{
		StoreID:      storeID,
		Keyword:      ctx.Query("q"),
		CategoryID:   ctx.Query("category_id"),
		Subcategory:  ctx.Query("subcategory"),
		Section:      ctx.Query("section"),
		FavoriteOnly: ctx.Query("favorite") == "true",
		Sort:         ctx.Query("sort"),
		MemberID:     member.ID,
		Page:         page,
		PageSize:     size,
	})
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ToggleFavorite 收藏与取消收藏的同一个入口，回切换后的状态与收藏总数
// @Summary 切换商品收藏
// @Tags shop
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.FavoriteRequest true "商品 ID"
// @Success 200 {object} models.ApiResponse{data=models.FavoriteResult}
// @Failure 404 {object} models.ApiResponse "商品不存在"
// @Router /api/shop/favorites [post]
func (c *ShopController) ToggleFavorite(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.FavoriteRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.shop.ToggleFavorite(memberID, req.ProductID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// RemoveFavorites 收藏页多选后批量取消收藏
// @Summary 批量取消收藏
// @Tags shop
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.FavoriteRemoveRequest true "商品 ID 列表"
// @Success 200 {object} models.ApiResponse{data=models.FavoriteRemoveResult}
// @Router /api/shop/favorites [delete]
func (c *ShopController) RemoveFavorites(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.FavoriteRemoveRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.shop.RemoveFavorites(memberID, req.ProductIDs)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// HotSearch 搜索页空态
// @Summary 热搜词与热门类目（当前门店）
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.SearchHotData}
// @Router /api/shop/search/hot [get]
func (c *ShopController) HotSearch(ctx *gin.Context) {
	storeID, _, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.shop.HotSearch(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// NearbyStores 买家侧附近门店：授权定位后按距离升序，未授权时按创建顺序返回
// @Summary 附近的门店
// @Description 经纬度缺省用会员最近一次定位；超配送半径的行标 out_of_range
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param longitude query number false "买家经度"
// @Param latitude query number false "买家纬度"
// @Param keyword query string false "门店名关键词"
// @Success 200 {object} models.ApiResponse{data=models.NearbyStoreList}
// @Router /api/shop/stores/nearby [get]
func (c *ShopController) NearbyStores(ctx *gin.Context) {
	_, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	longitude := queryFloat(ctx, "longitude", member.Longitude)
	latitude := queryFloat(ctx, "latitude", member.Latitude)
	data, err := c.shop.NearbyStores(longitude, latitude, ctx.Query("keyword"), member.DefaultStoreID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SelectStore 切换当前门店，之后所有列表/购物车/下单都归属这家店
// @Summary 切换当前门店
// @Tags shop
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.StoreSelectionRequest true "门店 ID 与最近一次定位"
// @Success 200 {object} models.ApiResponse{data=models.StoreSelectionData}
// @Failure 404 {object} models.ApiResponse "门店不存在"
// @Failure 422 {object} models.ApiResponse "门店休息中"
// @Router /api/shop/stores/selection [put]
func (c *ShopController) SelectStore(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.StoreSelectionRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.shop.SelectStore(memberID, req.StoreID, req.Longitude, req.Latitude)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ProductDetail 商品详情
// @Summary 商品详情与相关推荐
// @Tags shop
// @Produce json
// @Security CookieAuth
// @Param product_id path string true "商品 ID"
// @Success 200 {object} models.ApiResponse{data=models.ProductDetail}
// @Failure 404 {object} models.ApiResponse "商品不存在"
// @Router /api/shop/products/{product_id} [get]
func (c *ShopController) ProductDetail(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.shop.Detail(ctx.Param("product_id"), memberID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}
