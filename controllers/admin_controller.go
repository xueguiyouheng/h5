// controllers 控制层
// admin_controller.go 运营中台接口：门店资料、轮播、类目（含子类目）、商品发布、订单处理、统计
// 所有接口都跑在 AdminShopScope 注入的 storeID 作用域上，商家只能碰自己门店的数据
package controllers

import (
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// AdminController 中台控制器
type AdminController struct {
	admin *services.AdminService
	shop  *services.ShopService
}

// NewAdminController 创建中台控制器实例
func NewAdminController() *AdminController {
	return &AdminController{
		admin: services.NewAdminService(),
		shop:  services.NewShopService(),
	}
}

// adminScope 中台数据作用域：门店 ID 由 AdminShopScope 注入，操作人取登录账号名
func adminScope(ctx *gin.Context) (string, string) {
	operator := ctx.GetString("username")
	if operator == "" {
		operator = "商家"
	}
	return ctx.GetString("storeID"), operator
}

// ---------- 门店资料 ----------

// StoreProfile 本店资料
// @Summary 门店资料
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.Store}
// @Router /api/admin/store [get]
func (c *AdminController) StoreProfile(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	store, err := c.shop.StoreByID(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	if store == nil {
		fail(ctx, services.ErrNotFound("门店不存在"))
		return
	}
	ok(ctx, store)
}

// SaveStoreProfile 编辑本店资料
// @Summary 编辑门店资料
// @Description 字段为空表示不修改；status 为 open / closed，休息中的门店买家侧不可选
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.StoreProfileRequest true "门店资料"
// @Success 200 {object} models.ApiResponse{data=models.Store}
// @Router /api/admin/store [put]
func (c *AdminController) SaveStoreProfile(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.StoreProfileRequest
	if !bindJSON(ctx, &req) {
		return
	}
	store, err := c.shop.UpdateStore(storeID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, store)
}

// ---------- 轮播 ----------

// Carousels 轮播列表
// @Summary 轮播配置列表（本店）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.CarouselList}
// @Router /api/admin/carousel [get]
func (c *AdminController) Carousels(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	list, err := c.admin.CarouselList(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, &models.CarouselList{List: list})
}

// CreateCarousel 新增轮播
// @Summary 新增轮播配置
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.CarouselRequest true "轮播内容"
// @Success 200 {object} models.ApiResponse{data=models.Carousel}
// @Router /api/admin/carousel [post]
func (c *AdminController) CreateCarousel(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.CarouselRequest
	if !bindJSON(ctx, &req) {
		return
	}
	item, err := c.admin.CreateCarousel(storeID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, item)
}

// UpdateCarousel 编辑轮播
// @Summary 编辑轮播配置
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "轮播 ID"
// @Param body body models.CarouselRequest true "轮播内容"
// @Success 200 {object} models.ApiResponse{data=models.Carousel}
// @Router /api/admin/carousel/{id} [put]
func (c *AdminController) UpdateCarousel(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.CarouselRequest
	if !bindJSON(ctx, &req) {
		return
	}
	item, err := c.admin.UpdateCarousel(storeID, ctx.Param("id"), &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, item)
}

// DeleteCarousel 删除轮播
// @Summary 删除轮播配置
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "轮播 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/admin/carousel/{id} [delete]
func (c *AdminController) DeleteCarousel(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	if err := c.admin.DeleteCarousel(storeID, ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// ---------- 类目 ----------

// Categories 类目列表
// @Summary 类目分页列表（本店）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 20"
// @Param keyword query string false "名称模糊搜索"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/admin/categories [get]
func (c *AdminController) Categories(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	page, size := pageParam(ctx, 20)
	data, err := c.admin.Categories(storeID, page, size, ctx.Query("keyword"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Category 类目详情
// @Summary 类目详情（含子类目）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "类目 ID"
// @Success 200 {object} models.ApiResponse{data=models.AdminCategory}
// @Router /api/admin/categories/{id} [get]
func (c *AdminController) Category(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	data, err := c.admin.Category(storeID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CreateCategory 新增类目
// @Summary 新增类目及其子类目
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.CategoryRequest true "类目内容"
// @Success 200 {object} models.ApiResponse{data=models.AdminCategory}
// @Router /api/admin/categories [post]
func (c *AdminController) CreateCategory(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.CategoryRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.CreateCategory(storeID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UpdateCategory 编辑类目
// @Summary 编辑类目
// @Description subcategories 为全量替换，未传则保持原子类目
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "类目 ID"
// @Param body body models.CategoryRequest true "类目内容"
// @Success 200 {object} models.ApiResponse{data=models.AdminCategory}
// @Router /api/admin/categories/{id} [put]
func (c *AdminController) UpdateCategory(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.CategoryRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.UpdateCategory(storeID, ctx.Param("id"), &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// DeleteCategory 删除类目
// @Summary 删除类目
// @Description 类目下仍有商品时返回 422
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "类目 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/admin/categories/{id} [delete]
func (c *AdminController) DeleteCategory(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	if err := c.admin.DeleteCategory(storeID, ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// ---------- 商品 ----------

// Products 商品列表
// @Summary 商品分页列表（本店）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 20"
// @Param keyword query string false "名称模糊搜索"
// @Param category_id query string false "按类目过滤"
// @Param status query string false "on / off"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/admin/products [get]
func (c *AdminController) Products(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	page, size := pageParam(ctx, 20)
	data, err := c.admin.Products(storeID, page, size, ctx.Query("keyword"), ctx.Query("category_id"), ctx.Query("status"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// Product 商品详情
// @Summary 商品详情
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Success 200 {object} models.ApiResponse{data=models.Product}
// @Router /api/admin/products/{id} [get]
func (c *AdminController) Product(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	data, err := c.admin.Product(storeID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CreateProduct 发品
// @Summary 发布商品
// @Description 图片先走 POST /api/uploads 拿到 URL，商品文档只保存 URL
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.ProductRequest true "商品内容"
// @Success 200 {object} models.ApiResponse{data=models.Product}
// @Router /api/admin/products [post]
func (c *AdminController) CreateProduct(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.ProductRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.CreateProduct(storeID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UpdateProduct 改品
// @Summary 编辑商品
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Param body body models.ProductRequest true "商品内容"
// @Success 200 {object} models.ApiResponse{data=models.Product}
// @Router /api/admin/products/{id} [put]
func (c *AdminController) UpdateProduct(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.ProductRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.UpdateProduct(storeID, ctx.Param("id"), &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SetProductStatus 上下架
// @Summary 商品上下架
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Param body body models.StatusRequest true "on / off"
// @Success 200 {object} models.ApiResponse{data=models.Product}
// @Router /api/admin/products/{id}/status [put]
func (c *AdminController) SetProductStatus(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	var req models.StatusRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.SetProductStatus(storeID, ctx.Param("id"), req.Status)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// DeleteProduct 删除商品
// @Summary 删除商品
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/admin/products/{id} [delete]
func (c *AdminController) DeleteProduct(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	if err := c.admin.DeleteProduct(storeID, ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// ---------- 订单处理 ----------

// Orders 订单列表
// @Summary 订单分页列表（本店）
// @Description status 为空查全部；keyword 命中单号 / 收货人 / 手机号
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 10"
// @Param keyword query string false "单号 / 收货人 / 手机号"
// @Param status query string false "accepted / ready / delivered / cancelled"
// @Param payment_status query string false "unpaid / paid"
// @Param since query string false "起始时间 RFC3339"
// @Param until query string false "结束时间 RFC3339"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/admin/orders [get]
func (c *AdminController) Orders(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	page, size := pageParam(ctx, 10)
	data, err := c.admin.AdminOrders(services.AdminOrderQuery{
		StoreID:       storeID,
		Keyword:       ctx.Query("keyword"),
		Status:        ctx.Query("status"),
		PaymentStatus: ctx.Query("payment_status"),
		Since:         ctx.Query("since"),
		Until:         ctx.Query("until"),
		Page:          page,
		PageSize:      size,
	})
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// OrderSummary 订单看板计数
// @Summary 订单各状态计数与今日概览
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.AdminOrderSummary}
// @Router /api/admin/orders/summary [get]
func (c *AdminController) OrderSummary(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	data, err := c.admin.AdminOrderSummary(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// OrderDetail 订单详情
// @Summary 订单详情（含支付单与处理留痕）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Success 200 {object} models.ApiResponse{data=models.AdminOrderDetail}
// @Router /api/admin/orders/{id} [get]
func (c *AdminController) OrderDetail(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	data, err := c.admin.AdminOrderDetail(storeID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SetOrderStatus 推进订单状态
// @Summary 推进订单状态
// @Description accepted → ready → delivered，ready 可退回 accepted；未支付订单返回 422
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Param body body models.AdminOrderStatusRequest true "目标状态与备注"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/admin/orders/{id}/status [put]
func (c *AdminController) SetOrderStatus(ctx *gin.Context) {
	storeID, operator := adminScope(ctx)
	var req models.AdminOrderStatusRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.AdminOrderSetStatus(storeID, ctx.Param("id"), req.Status, req.Note, operator)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CancelOrder 中台取消订单
// @Summary 商家取消订单
// @Description 回补库存与优惠券；已支付订单标记 refund_status=pending 走线下退款
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Param body body models.AdminOrderCancelRequest true "取消原因"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/admin/orders/{id}/cancel [post]
func (c *AdminController) CancelOrder(ctx *gin.Context) {
	storeID, operator := adminScope(ctx)
	var req models.AdminOrderCancelRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.AdminOrderCancel(storeID, ctx.Param("id"), req.Reason, operator)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UpdateOrderRemark 商家备注
// @Summary 编辑商家备注
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Param body body models.AdminOrderRemarkRequest true "备注内容"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/admin/orders/{id}/remark [put]
func (c *AdminController) UpdateOrderRemark(ctx *gin.Context) {
	storeID, operator := adminScope(ctx)
	var req models.AdminOrderRemarkRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.AdminOrderRemark(storeID, ctx.Param("id"), req.AdminRemark, operator)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UpdateOrderShipping 配送信息
// @Summary 填写配送信息
// @Description 自配送填骑手与电话，快递填运单号；留空即清除对应字段
// @Tags admin
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Param body body models.AdminOrderShippingRequest true "配送信息"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/admin/orders/{id}/shipping [put]
func (c *AdminController) UpdateOrderShipping(ctx *gin.Context) {
	storeID, operator := adminScope(ctx)
	var req models.AdminOrderShippingRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.admin.AdminOrderShipping(storeID, ctx.Param("id"), &req, operator)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ---------- 统计 ----------

// Stats 中台统计
// @Summary 中台首页计数（本店）
// @Tags admin
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.AdminStats}
// @Router /api/admin/stats [get]
func (c *AdminController) Stats(ctx *gin.Context) {
	storeID, _ := adminScope(ctx)
	data, err := c.admin.Stats(storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}
