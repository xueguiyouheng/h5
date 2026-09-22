// services 业务逻辑层
// admin_service.go 运营中台：轮播、类目（含子类目）、商品发布、订单处理与统计
// 中台账号即商家，一切读写都强制限定在自己门店的 store_id 范围内
package services

import (
	"regexp"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"

	"go.mongodb.org/mongo-driver/bson"
)

// AdminService 中台业务服务
type AdminService struct{}

// NewAdminService 创建中台服务实例
func NewAdminService() *AdminService { return &AdminService{} }

// validSections 首页版块白名单
var validSections = map[string]bool{"exclusive_offer": true, "best_selling": true, "recommend": true}

// keywordEscapeRE 搜索关键词转义用
var keywordEscapeRE = regexp.MustCompile(`[.*+?^${}()|[\]\\]`)

// withStore 给查询条件钉上门店归属，中台不存在跨店取数的场景
func withStore(storeID string, extra bson.M) bson.M {
	filter := config.M(map[string]interface{}{"store_id": storeID})
	for k, v := range extra {
		filter[k] = v
	}
	return filter
}

// ---------- 轮播 ----------

// CarouselList 轮播配置列表，中台侧包含下架项
func (s *AdminService) CarouselList(storeID string) ([]models.Carousel, error) {
	var list []models.Carousel
	if err := findDocs(config.Collections.Carousels, withStore(storeID, nil), "sort", true, 50, 0, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Carousel{}
	}
	return list, nil
}

// CreateCarousel 新增轮播
func (s *AdminService) CreateCarousel(storeID string, req *models.CarouselRequest) (*models.Carousel, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, ErrBadRequest("请填写标题")
	}
	if strings.TrimSpace(req.ImageURL) == "" {
		return nil, ErrBadRequest("请上传轮播图片")
	}
	item := &models.Carousel{
		ID:        newID(),
		StoreID:   storeID,
		Title:     strings.TrimSpace(req.Title),
		ImageURL:  strings.TrimSpace(req.ImageURL),
		Link:      strings.TrimSpace(req.Link),
		Sort:      req.Sort,
		Status:    normalizeStatus(req.Status),
		UpdatedAt: time.Now().UTC(),
	}
	if err := insertDoc(config.Collections.Carousels, item); err != nil {
		return nil, err
	}
	return item, nil
}

// UpdateCarousel 编辑轮播
func (s *AdminService) UpdateCarousel(storeID, id string, req *models.CarouselRequest) (*models.Carousel, error) {
	current, err := s.carouselByID(storeID, id)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, ErrNotFound("轮播不存在")
	}
	item, err := s.CreateCarousel(storeID, req)
	if err != nil {
		return nil, err
	}
	item.ID = id
	item.UpdatedAt = time.Now().UTC()
	if err := replaceDoc(config.Collections.Carousels, id, item); err != nil {
		return nil, err
	}
	return item, nil
}

// DeleteCarousel 删除轮播
func (s *AdminService) DeleteCarousel(storeID, id string) error {
	current, err := s.carouselByID(storeID, id)
	if err != nil {
		return err
	}
	if current == nil {
		return ErrNotFound("轮播不存在")
	}
	return deleteDoc(config.Collections.Carousels, id)
}

// carouselByID 按 ID 取本店轮播，别家店的 ID 视为不存在
func (s *AdminService) carouselByID(storeID, id string) (*models.Carousel, error) {
	var item models.Carousel
	if err := findOneDoc(config.Collections.Carousels, withStore(storeID, bson.M{"_id": id}), &item); err != nil {
		return nil, err
	}
	if item.ID == "" {
		return nil, nil
	}
	return &item, nil
}

// ---------- 类目 ----------

// Categories 中台类目分页
func (s *AdminService) Categories(storeID string, page, pageSize int, keyword string) (*models.PageResult, error) {
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 20)

	filter := withStore(storeID, keywordFilter(keyword, "name"))
	total, err := countDocs(config.Collections.Categories, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Category
	if err := findDocs(config.Collections.Categories, filter, "sort", false, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	views := make([]models.AdminCategory, 0, len(list))
	for i := range list {
		view, err := s.categoryView(&list[i])
		if err != nil {
			return nil, err
		}
		views = append(views, *view)
	}
	return &models.PageResult{List: views, Total: total, Page: page, PageSize: pageSize}, nil
}

// Category 中台类目详情
func (s *AdminService) Category(storeID, id string) (*models.AdminCategory, error) {
	var cat models.Category
	if err := findOneDoc(config.Collections.Categories, withStore(storeID, bson.M{"_id": id}), &cat); err != nil {
		return nil, err
	}
	if cat.ID == "" {
		return nil, ErrNotFound("类目不存在")
	}
	return s.categoryView(&cat)
}

// categoryView 补齐子类目与商品数
func (s *AdminService) categoryView(cat *models.Category) (*models.AdminCategory, error) {
	var subs []models.Subcategory
	if err := findDocs(config.Collections.Subcategories, config.M(map[string]interface{}{"category_id": cat.ID}), "sort", false, 50, 0, &subs); err != nil {
		return nil, err
	}
	if subs == nil {
		subs = []models.Subcategory{}
	}
	count, err := countDocs(config.Collections.Products, config.M(map[string]interface{}{
		"category_id": cat.ID,
		"store_id":    cat.StoreID,
	}))
	if err != nil {
		return nil, err
	}
	updatedAt := cat.CreatedAt
	return &models.AdminCategory{
		ID:            cat.ID,
		StoreID:       cat.StoreID,
		Name:          cat.Name,
		ImageURL:      cat.ImageURL,
		Sort:          cat.Sort,
		Status:        normalizeStatus(cat.Status),
		ProductCount:  count,
		Subcategories: subs,
		UpdatedAt:     updatedAt,
	}, nil
}

// CreateCategory 新增类目，子类目一并写入
func (s *AdminService) CreateCategory(storeID string, req *models.CategoryRequest) (*models.AdminCategory, error) {
	name := strings.TrimSpace(req.Name)
	if len(name) < 2 || len(name) > 40 {
		return nil, ErrBadRequest("类目名称需 2-40 个字符")
	}
	now := time.Now().UTC()
	cat := &models.Category{
		ID:        newID(),
		StoreID:   storeID,
		Name:      name,
		ImageURL:  strings.TrimSpace(req.ImageURL),
		Sort:      req.Sort,
		Status:    normalizeStatus(req.Status),
		CreatedAt: now,
	}
	if err := insertDoc(config.Collections.Categories, cat); err != nil {
		if isDuplicateErr(err) {
			return nil, ErrConflict("本店已有同名类目")
		}
		return nil, err
	}
	if err := s.replaceSubcategories(cat.ID, req.Subcategories); err != nil {
		return nil, err
	}
	return s.Category(storeID, cat.ID)
}

// UpdateCategory 编辑类目；子类目按传入数组全量替换
func (s *AdminService) UpdateCategory(storeID, id string, req *models.CategoryRequest) (*models.AdminCategory, error) {
	if _, err := s.Category(storeID, id); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if len(name) < 2 || len(name) > 40 {
		return nil, ErrBadRequest("类目名称需 2-40 个字符")
	}
	fields := config.M(map[string]interface{}{
		"name":   name,
		"sort":   req.Sort,
		"status": normalizeStatus(req.Status),
	})
	if strings.TrimSpace(req.ImageURL) != "" {
		fields["image_url"] = strings.TrimSpace(req.ImageURL)
	}
	if err := updateDoc(config.Collections.Categories, id, fields); err != nil {
		return nil, err
	}
	if req.Subcategories != nil {
		if err := s.replaceSubcategories(id, req.Subcategories); err != nil {
			return nil, err
		}
	}
	return s.Category(storeID, id)
}

// DeleteCategory 删除类目，同时删除子类目；名下有商品时拒绝
func (s *AdminService) DeleteCategory(storeID, id string) error {
	count, err := countDocs(config.Collections.Products, withStore(storeID, bson.M{"category_id": id}))
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrUnprocessable("该类目下仍有商品，请先下架或改分类目")
	}
	if _, err := s.Category(storeID, id); err != nil {
		return err
	}
	if err := deleteDocs(config.Collections.Subcategories, config.M(map[string]interface{}{"category_id": id})); err != nil {
		return err
	}
	return deleteDoc(config.Collections.Categories, id)
}

// replaceSubcategories 全量替换子类目
func (s *AdminService) replaceSubcategories(categoryID string, reqs []models.SubcategoryRequest) error {
	if err := deleteDocs(config.Collections.Subcategories, config.M(map[string]interface{}{"category_id": categoryID})); err != nil {
		return err
	}
	for i, req := range reqs {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			return ErrBadRequest("子类目名称不能为空")
		}
		sort := req.Sort
		if sort == 0 {
			sort = i + 1
		}
		sub := &models.Subcategory{
			ID:         firstNonEmpty(req.ID, newID()),
			CategoryID: categoryID,
			Name:       name,
			Sort:       sort,
		}
		if err := insertDoc(config.Collections.Subcategories, sub); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 商品 ----------

// Products 中台商品分页，支持关键词/类目/状态筛选
func (s *AdminService) Products(storeID string, page, pageSize int, keyword, categoryID, status string) (*models.PageResult, error) {
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 20)

	filter := withStore(storeID, keywordFilter(keyword, "name"))
	if categoryID != "" {
		filter["category_id"] = categoryID
	}
	if status == "on" || status == "off" {
		filter["status"] = status
	}
	total, err := countDocs(config.Collections.Products, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Product
	if err := findDocs(config.Collections.Products, filter, "updated_at", true, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Product{}
	}
	return &models.PageResult{List: list, Total: total, Page: page, PageSize: pageSize}, nil
}

// Product 中台商品详情
func (s *AdminService) Product(storeID, id string) (*models.Product, error) {
	var product models.Product
	if err := findOneDoc(config.Collections.Products, withStore(storeID, bson.M{"_id": id}), &product); err != nil {
		return nil, err
	}
	if product.ID == "" {
		return nil, ErrNotFound("商品不存在")
	}
	return &product, nil
}

// CreateProduct 发品
func (s *AdminService) CreateProduct(storeID string, req *models.ProductRequest) (*models.Product, error) {
	if err := validateProductRequest(storeID, req); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	product := &models.Product{
		ID:          newID(),
		StoreID:     storeID,
		Name:        strings.TrimSpace(req.Name),
		Price:       normalizePrice(req.Price),
		Currency:    strings.ToUpper(firstNonEmpty(req.Currency, "USD")),
		Unit:        firstNonEmpty(strings.TrimSpace(req.Unit), "per kg"),
		OldPrice:    optionalPrice(req.OldPrice),
		Badge:       strings.TrimSpace(req.Badge),
		ImageURL:    strings.TrimSpace(req.ImageURL),
		Images:      req.Images,
		Description: strings.TrimSpace(req.Description),
		CategoryID:  strings.TrimSpace(req.CategoryID),
		Sections:    cleanSections(req.Sections),
		Stock:       req.Stock,
		Sort:        req.Sort,
		Status:      normalizeStatus(req.Status),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if product.Images == nil {
		product.Images = []string{product.ImageURL}
	}
	if req.Nutrition != nil {
		product.Nutrition = *req.Nutrition
	}
	if err := s.applySubcategory(product, req.SubcategoryID); err != nil {
		return nil, err
	}
	if err := insertDoc(config.Collections.Products, product); err != nil {
		return nil, err
	}
	return s.Product(storeID, product.ID)
}

// UpdateProduct 改品
func (s *AdminService) UpdateProduct(storeID, id string, req *models.ProductRequest) (*models.Product, error) {
	current, err := s.Product(storeID, id)
	if err != nil {
		return nil, err
	}
	if err := validateProductRequest(storeID, req); err != nil {
		return nil, err
	}
	product, err := s.CreateProduct(storeID, req)
	if err != nil {
		return nil, err
	}
	product.ID = id
	product.CreatedAt = current.CreatedAt
	product.Sales = current.Sales
	product.Stock = current.Stock
	if req.Stock > 0 {
		product.Stock = req.Stock
	}
	product.UpdatedAt = time.Now().UTC()
	if err := replaceDoc(config.Collections.Products, id, product); err != nil {
		return nil, err
	}
	return s.Product(storeID, id)
}

// SetProductStatus 上下架
func (s *AdminService) SetProductStatus(storeID, id, status string) (*models.Product, error) {
	if status != "on" && status != "off" {
		return nil, ErrBadRequest("状态只能是 on 或 off")
	}
	if _, err := s.Product(storeID, id); err != nil {
		return nil, err
	}
	if err := updateDoc(config.Collections.Products, id, config.M(map[string]interface{}{
		"status":     status,
		"updated_at": time.Now().UTC(),
	})); err != nil {
		return nil, err
	}
	return s.Product(storeID, id)
}

// DeleteProduct 删除商品
func (s *AdminService) DeleteProduct(storeID, id string) error {
	if _, err := s.Product(storeID, id); err != nil {
		return err
	}
	return deleteDoc(config.Collections.Products, id)
}

// applySubcategory 把子类目 ID 解析成名称快照
func (s *AdminService) applySubcategory(product *models.Product, subcategoryID string) error {
	product.SubcategoryID = ""
	product.SubcategoryName = ""
	subcategoryID = strings.TrimSpace(subcategoryID)
	// 中台未选择子类目时会传 "0" 或空串，都视为不绑定
	if subcategoryID == "" || subcategoryID == "0" {
		return nil
	}
	var sub models.Subcategory
	if err := findOneDoc(config.Collections.Subcategories, config.M(map[string]interface{}{
		"_id":         subcategoryID,
		"category_id": product.CategoryID,
	}), &sub); err != nil {
		return err
	}
	if sub.ID == "" {
		return ErrBadRequest("子类目不属于该类目")
	}
	product.SubcategoryID = sub.ID
	product.SubcategoryName = sub.Name
	return nil
}

// validateProductRequest 发品参数校验
func validateProductRequest(storeID string, req *models.ProductRequest) error {
	name := strings.TrimSpace(req.Name)
	if len(name) < 2 || len(name) > 40 {
		return ErrBadRequest("商品名称需 2-40 个字符")
	}
	if priceValue(req.Price) <= 0 {
		return ErrBadRequest("请填写正确的售价")
	}
	if strings.TrimSpace(req.ImageURL) == "" {
		return ErrBadRequest("请上传商品主图")
	}
	if req.Stock < 0 {
		return ErrBadRequest("库存不能为负数")
	}
	if strings.TrimSpace(req.CategoryID) == "" {
		return ErrBadRequest("请选择商品类目")
	}
	var cat models.Category
	// 类目必须属于本店，不能把商品挂到别家店的类目下
	if err := findOneDoc(config.Collections.Categories, withStore(storeID, bson.M{"_id": strings.TrimSpace(req.CategoryID)}), &cat); err != nil {
		return err
	}
	if cat.ID == "" {
		return ErrBadRequest("商品类目不存在")
	}
	return nil
}

// cleanSections 过滤非法版块并保持顺序
func cleanSections(sections []string) []string {
	out := make([]string, 0, len(sections))
	for _, sec := range sections {
		sec = strings.TrimSpace(sec)
		if validSections[sec] {
			out = append(out, sec)
		}
	}
	return out
}

// optionalPrice 可选原价，非法或为零时不落库
func optionalPrice(s string) string {
	if priceValue(s) <= 0 {
		return ""
	}
	return normalizePrice(s)
}

// ---------- 统计 ----------

// Stats 中台首页计数，只统计本店
func (s *AdminService) Stats(storeID string) (*models.AdminStats, error) {
	products, err := countDocs(config.Collections.Products, withStore(storeID, nil))
	if err != nil {
		return nil, err
	}
	categories, err := countDocs(config.Collections.Categories, withStore(storeID, nil))
	if err != nil {
		return nil, err
	}
	carousels, err := countDocs(config.Collections.Carousels, withStore(storeID, nil))
	if err != nil {
		return nil, err
	}
	ongoing, err := countDocs(config.Collections.Orders, withStore(storeID, bson.M{"tab": "ongoing"}))
	if err != nil {
		return nil, err
	}
	return &models.AdminStats{
		ProductCount:      products,
		CategoryCount:     categories,
		CarouselCount:     carousels,
		OngoingOrderCount: ongoing,
	}, nil
}
