// services 业务逻辑层
// shop_service.go 店铺域：首页聚合、类目、商品列表（所有列表页共用）、收藏、商品详情
package services

import (
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"

	"go.mongodb.org/mongo-driver/bson"
)

// ShopService 店铺业务服务
type ShopService struct{}

// NewShopService 创建店铺服务实例
func NewShopService() *ShopService { return &ShopService{} }

// 首页版块 key 与展示标题
var homeSections = []struct{ key, title string }{
	{"exclusive_offer", "Exclusive Offer"},
	{"best_selling", "Best Selling"},
}

// carouselLimit 首页轮播最多取的条数
const carouselLimit = 10

// Carousel 首页轮播，按 sort 倒序（中台约定"数值越大越靠前"）；门店自己的轮播
func (s *ShopService) Carousel(storeID string) (*models.CarouselList, error) {
	var list []models.Carousel
	if err := findDocs(config.Collections.Carousels, storeFilter(storeID, map[string]interface{}{"status": "on"}), "sort", true, carouselLimit, 0, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Carousel{}
	}
	return &models.CarouselList{List: list}, nil
}

// storeFilter 给查询条件加上门店归属，storeID 为空表示不限门店（中台聚合场景）
func storeFilter(storeID string, extra map[string]interface{}) bson.M {
	filter := map[string]interface{}{}
	for k, v := range extra {
		filter[k] = v
	}
	if storeID != "" {
		filter["store_id"] = storeID
	}
	return config.M(filter)
}

// publishedFilter 只取上架商品的公共过滤条件
func publishedFilter(storeID string, extra map[string]interface{}) bson.M {
	filter := map[string]interface{}{"status": "on"}
	for k, v := range extra {
		filter[k] = v
	}
	if storeID != "" {
		filter["store_id"] = storeID
	}
	return config.M(filter)
}

// listProducts 按条件取商品
func (s *ShopService) listProducts(filter bson.M, sortKey string, desc bool, limit, skip int) ([]models.Product, error) {
	var list []models.Product
	if err := findDocs(config.Collections.Products, filter, sortKey, desc, limit, skip, &list); err != nil {
		return nil, err
	}
	return list, nil
}

// ProductQuery 商品列表的统一入参：搜索页、类目页、首页版块、收藏页都走 ListProducts，
// 只是填的过滤字段不同，所以分页、排序与收藏标记的行为在各列表天然一致
type ProductQuery struct {
	StoreID      string // 买家当前门店，列表只回这家店的商品
	Keyword      string // 商品名 / 描述模糊匹配
	CategoryID   string
	Subcategory  string
	Section      string
	FavoriteOnly bool
	Sort         string // "" 走运营排序，sales 按销量倒序
	MemberID     string // 有会员时给卡片标 collected，并支撑 FavoriteOnly
	Page         int
	PageSize     int
}

// favoriteScanLimit 收藏筛选一次取回的收藏数上限，收藏是会员私有小集合
const favoriteScanLimit = 500

// ListProducts 商品列表的唯一出口
func (s *ShopService) ListProducts(q ProductQuery) (*models.PageResult, error) {
	// 收藏跟着会员走，换门店后不该凭空消失；跨店加购由购物车侧拦下
	scopeID := q.StoreID
	if q.FavoriteOnly {
		scopeID = ""
	}
	filter := publishedFilter(scopeID, nil)
	if q.Section != "" && q.Section != "all" {
		filter["sections"] = q.Section
	}
	if q.CategoryID != "" {
		filter["category_id"] = q.CategoryID
	}
	if q.Subcategory != "" && q.Subcategory != "All" {
		filter["subcategory_name"] = q.Subcategory
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		filter["$or"] = []bson.M{keywordFilter(keyword, "name"), keywordFilter(keyword, "description")}
	}
	if q.FavoriteOnly {
		ids, err := s.favoriteProductIDs(q.MemberID)
		if err != nil {
			return nil, err
		}
		if len(ids) == 0 {
			return emptyProductPage(q.Page, q.PageSize), nil
		}
		filter["_id"] = bson.M{"$in": ids}
	}

	total, err := countDocs(config.Collections.Products, filter)
	if err != nil {
		return nil, err
	}
	page := clampPage(q.Page)
	size := clampPageSize(q.PageSize, 10)
	sortKey, desc := "sort", false
	if q.Sort == "sales" {
		sortKey, desc = "sales", true
	}
	list, err := s.listProducts(filter, sortKey, desc, size, (page-1)*size)
	if err != nil {
		return nil, err
	}
	collected, err := s.collectedOf(q.MemberID, list)
	if err != nil {
		return nil, err
	}
	return &models.PageResult{
		List:     models.CardViewsCollected(list, collected),
		Total:    total,
		Page:     page,
		PageSize: size,
	}, nil
}

// emptyProductPage 空结果也回合法分页字段，前端据此判定「没有更多」
func emptyProductPage(page, pageSize int) *models.PageResult {
	return &models.PageResult{
		List:     []models.ProductCard{},
		Total:    0,
		Page:     clampPage(page),
		PageSize: clampPageSize(pageSize, 10),
	}
}

// favoriteProductIDs 会员收藏的商品 ID；无会员时回空，收藏筛选因此不会漏成全量
func (s *ShopService) favoriteProductIDs(memberID string) ([]string, error) {
	if memberID == "" {
		return nil, nil
	}
	var docs []models.Favorite
	if err := findDocs(config.Collections.Favorites, config.M(map[string]interface{}{"member_id": memberID}), "_id", true, favoriteScanLimit, 0, &docs); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ProductID)
	}
	return ids, nil
}

// collectedOf 只查当页：一次取回会员收藏过的商品，卡片上的心形状态由此而来
func (s *ShopService) collectedOf(memberID string, list []models.Product) (map[string]bool, error) {
	if memberID == "" || len(list) == 0 {
		return nil, nil
	}
	ids := make([]string, 0, len(list))
	for _, p := range list {
		ids = append(ids, p.ID)
	}
	var docs []models.Favorite
	err := findDocs(config.Collections.Favorites, config.M(map[string]interface{}{
		"member_id":  memberID,
		"product_id": bson.M{"$in": ids},
	}), "", false, 0, 0, &docs)
	if err != nil {
		return nil, err
	}
	collected := make(map[string]bool, len(docs))
	for _, doc := range docs {
		collected[doc.ProductID] = true
	}
	return collected, nil
}

// ToggleFavorite 收藏与取消收藏同一个入口，回切换后的状态与总数
func (s *ShopService) ToggleFavorite(memberID, productID string) (*models.FavoriteResult, error) {
	if memberID == "" {
		return nil, ErrBadRequest("缺少会员身份")
	}
	if _, err := s.ProductByID(productID); err != nil {
		return nil, err
	}
	filter := config.M(map[string]interface{}{"member_id": memberID, "product_id": productID})
	var existing models.Favorite
	if err := findOneDoc(config.Collections.Favorites, filter, &existing); err != nil {
		return nil, err
	}
	collected := false
	if existing.ID != "" {
		if err := deleteDocs(config.Collections.Favorites, filter); err != nil {
			return nil, err
		}
	} else {
		doc := models.Favorite{ID: newID(), MemberID: memberID, ProductID: productID, CreatedAt: time.Now().UTC()}
		if err := insertDoc(config.Collections.Favorites, doc); err != nil {
			if !isDuplicateErr(err) {
				return nil, err
			}
			// 并发重复收藏被唯一索引挡住，结果仍是「已收藏」
		}
		collected = true
	}
	count, err := countDocs(config.Collections.Favorites, config.M(map[string]interface{}{"member_id": memberID}))
	if err != nil {
		return nil, err
	}
	return &models.FavoriteResult{ProductID: productID, Collected: collected, Count: count}, nil
}

// RemoveFavorites 批量取消收藏：条件里带会员 ID，越权的商品 ID 不会被删到
func (s *ShopService) RemoveFavorites(memberID string, productIDs []string) (*models.FavoriteRemoveResult, error) {
	if memberID == "" {
		return nil, ErrBadRequest("缺少会员身份")
	}
	ids := make([]string, 0, len(productIDs))
	for _, id := range productIDs {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			ids = append(ids, trimmed)
		}
	}
	if len(ids) == 0 {
		return nil, ErrBadRequest("没有要取消收藏的商品")
	}
	removed, err := deleteDocsCounted(config.Collections.Favorites, config.M(map[string]interface{}{
		"member_id":  memberID,
		"product_id": bson.M{"$in": ids},
	}))
	if err != nil {
		return nil, err
	}
	count, err := countDocs(config.Collections.Favorites, config.M(map[string]interface{}{"member_id": memberID}))
	if err != nil {
		return nil, err
	}
	return &models.FavoriteRemoveResult{Removed: removed, Count: count}, nil
}

// Categories 分页取一级类目，只看当前门店的类目
func (s *ShopService) Categories(page, pageSize int, storeID string) (*models.PageResult, error) {
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 8)

	filter := storeFilter(storeID, map[string]interface{}{"status": "on"})
	total, err := countDocs(config.Collections.Categories, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Category
	if err := findDocs(config.Collections.Categories, filter, "sort", false, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	views := make([]models.CategoryView, 0, len(list))
	for i := range list {
		v, err := s.categoryView(&list[i])
		if err != nil {
			return nil, err
		}
		views = append(views, *v)
	}
	return &models.PageResult{List: views, Total: total, Page: page, PageSize: pageSize}, nil
}

// categoryView 补齐类目计数与子类目名称
func (s *ShopService) categoryView(cat *models.Category) (*models.CategoryView, error) {
	count, err := countDocs(config.Collections.Products, publishedFilter(cat.StoreID, map[string]interface{}{"category_id": cat.ID}))
	if err != nil {
		return nil, err
	}
	subs, err := s.subcategoryNames(cat.ID)
	if err != nil {
		return nil, err
	}
	return &models.CategoryView{
		ID:            cat.ID,
		Label:         cat.Name,
		Name:          cat.Name,
		ImageURL:      cat.ImageURL,
		ProductCount:  count,
		Subcategories: append([]string{"All"}, subs...),
	}, nil
}

// subcategoryNames 取类目下全部子类目名称（按 sort 升序）
func (s *ShopService) subcategoryNames(categoryID string) ([]string, error) {
	var subs []models.Subcategory
	if err := findDocs(config.Collections.Subcategories, config.M(map[string]interface{}{"category_id": categoryID}), "sort", false, 50, 0, &subs); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(subs))
	for _, sub := range subs {
		names = append(names, sub.Name)
	}
	return names, nil
}

// CategoryByID 按 ID 取类目
func (s *ShopService) CategoryByID(id string) (*models.Category, error) {
	var cat models.Category
	if err := findOneDoc(config.Collections.Categories, config.M(map[string]interface{}{"_id": id}), &cat); err != nil {
		return nil, err
	}
	if cat.ID == "" {
		return nil, ErrNotFound("类目不存在")
	}
	return &cat, nil
}

// ProductByID 按 ID 取商品
func (s *ShopService) ProductByID(id string) (*models.Product, error) {
	var product models.Product
	if err := findOneDoc(config.Collections.Products, config.M(map[string]interface{}{"_id": id}), &product); err != nil {
		return nil, err
	}
	if product.ID == "" {
		return nil, ErrNotFound("商品不存在")
	}
	return &product, nil
}

// CategoryDetail 类目元信息（名称与子类目 tab）；类目下的商品走 ListProducts 的 category_id 过滤
// 买家只能进当前门店的类目，别家店的 ID 一律按不存在处理
func (s *ShopService) CategoryDetail(id, storeID string) (*models.CategoryView, error) {
	cat, err := s.CategoryByID(id)
	if err != nil {
		return nil, err
	}
	if storeID != "" && cat.StoreID != storeID {
		return nil, ErrNotFound("类目不存在")
	}
	return s.categoryView(cat)
}

// HotSearch 搜索页空态：热搜词与热门类目都只取当前门店
func (s *ShopService) HotSearch(storeID string) (*models.SearchHotData, error) {
	products, err := s.listProducts(publishedFilter(storeID, nil), "sales", true, 8, 0)
	if err != nil {
		return nil, err
	}
	keywords := make([]string, 0, 8)
	for _, p := range products {
		keywords = append(keywords, p.Name)
	}
	cats, err := s.Categories(1, 8, storeID)
	if err != nil {
		return nil, err
	}
	data := &models.SearchHotData{Keywords: keywords, Categories: []models.CategoryView{}}
	if views, ok := cats.List.([]models.CategoryView); ok {
		data.Categories = views
	}
	return data, nil
}

// Detail 商品详情，含同类相关推荐；memberID 决定收藏标记
// 推荐只在本店内取，买家不会在别家店的页面上被引导去跨店下单
func (s *ShopService) Detail(id, memberID string) (*models.ProductDetail, error) {
	product, err := s.ProductByID(id)
	if err != nil {
		return nil, err
	}
	relatedFilter := publishedFilter(product.StoreID, map[string]interface{}{
		"category_id": product.CategoryID,
		"_id":         bson.M{"$ne": product.ID},
	})
	var related []models.Product
	if err := findDocs(config.Collections.Products, relatedFilter, "sales", true, 6, 0, &related); err != nil {
		return nil, err
	}
	if len(related) == 0 {
		related, err = s.listProducts(publishedFilter(product.StoreID, map[string]interface{}{"_id": bson.M{"$ne": product.ID}}), "sales", true, 6, 0)
		if err != nil {
			return nil, err
		}
	}
	images := product.Images
	if len(images) == 0 {
		images = []string{product.ImageURL}
	}
	collected, err := s.collectedOf(memberID, []models.Product{*product})
	if err != nil {
		return nil, err
	}
	return &models.ProductDetail{
		ID:           product.ID,
		Name:         product.Name,
		Price:        product.Price,
		Currency:     product.Currency,
		Unit:         product.Unit,
		OldPrice:     product.OldPrice,
		Badge:        product.Badge,
		HeroImageURL: product.ImageURL,
		ImageURL:     product.ImageURL,
		Images:       images,
		Description:  product.Description,
		Nutrition:    product.Nutrition,
		Stock:        product.Stock,
		CategoryID:   product.CategoryID,
		Collected:    collected[product.ID],
		Related:      models.CardViews(related),
	}, nil
}

// Home 首页聚合：当前门店、问候、轮播、运营版块、推荐分页
// 买家看到的整页数据都锁在一家门店上，切店即换 storeID 重新取数
func (s *ShopService) Home(member *models.Member, page, pageSize int) (*models.HomeData, error) {
	data := &models.HomeData{
		Greeting: models.Greeting{Name: "there"},
		Carousel: []models.Carousel{},
		Sections: []models.HomeSection{},
	}
	storeID := ""
	if member != nil {
		if member.Username != "" {
			parts := strings.Fields(member.Username)
			if len(parts) > 0 {
				data.Greeting.Name = parts[0]
			}
			data.Greeting.AvatarURL = member.AvatarURL
		}
		store, err := s.ResolveStore(member)
		if err != nil {
			return nil, err
		}
		if store != nil {
			storeID = store.ID
			data.Store = homeStore(store, member)
		}
	}

	carousel, err := s.Carousel(storeID)
	if err != nil {
		return nil, err
	}
	data.Carousel = carousel.List
	for _, sec := range homeSections {
		list, err := s.listProducts(publishedFilter(storeID, map[string]interface{}{"sections": sec.key}), "sort", false, 10, 0)
		if err != nil {
			return nil, err
		}
		data.Sections = append(data.Sections, models.HomeSection{Key: sec.key, Title: sec.title, Items: models.CardViews(list)})
	}

	memberID := ""
	if member != nil {
		memberID = member.ID
	}
	rec, err := s.ListProducts(ProductQuery{StoreID: storeID, Section: "recommend", MemberID: memberID, Page: page, PageSize: pageSize})
	if err != nil {
		return nil, err
	}
	data.Recommend = *rec
	return data, nil
}
