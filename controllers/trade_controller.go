// controllers 控制层
// trade_controller.go 交易域：购物车、优惠券、收货地址、订单；支付见 go-gin/payment 模块
package controllers

import (
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

// TradeController 交易控制器
type TradeController struct {
	cart      *services.CartService
	vouchers  *services.VoucherService
	addresses *services.AddressService
	orders    *services.OrderService
}

// NewTradeController 创建交易控制器实例
func NewTradeController() *TradeController {
	return &TradeController{
		cart:      services.NewCartService(),
		vouchers:  services.NewVoucherService(),
		addresses: services.NewAddressService(),
		orders:    services.NewOrderService(),
	}
}

// ---------- 购物车 ----------

// GetCart 购物车全量
// @Summary 购物车与金额汇总
// @Description 运费与优惠由服务端计算；只回当前门店的行，可带 voucher_id 试算券后价
// @Tags cart
// @Produce json
// @Security CookieAuth
// @Param voucher_id query string false "试用的优惠券 ID"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart [get]
func (c *TradeController) GetCart(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.cart.View(member.ID, storeID, ctx.Query("voucher_id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// AddCartItem 加入购物车
// @Summary 加入购物车
// @Tags cart
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.AddToCartRequest true "商品与数量"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart/items [post]
func (c *TradeController) AddCartItem(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.AddToCartRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.cart.Add(member.ID, storeID, req.ProductID, req.Qty)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// AddCartItemsBatch 批量加入购物车，收藏页「一键加入购物车」用
// @Summary 批量加入购物车
// @Description 一次读改写整张车；任一条不合规（下架 / 库存不足 / 跨门店）整批不生效
// @Tags cart
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.AddManyToCartRequest true "商品与数量列表"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart/items/batch [post]
func (c *TradeController) AddCartItemsBatch(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.AddManyToCartRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.cart.AddMany(member.ID, storeID, req.Items)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// SetCartItemQty 修改数量
// @Summary 修改购物车数量
// @Description qty 为 0 时等价于删除该行
// @Tags cart
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Param body body models.SetQtyRequest true "数量"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart/items/{id} [patch]
func (c *TradeController) SetCartItemQty(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.SetQtyRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.cart.SetQty(member.ID, storeID, ctx.Param("id"), req.Qty)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// RemoveCartItem 删除行项目
// @Summary 删除购物车行项目
// @Tags cart
// @Produce json
// @Security CookieAuth
// @Param id path string true "商品 ID"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart/items/{id} [delete]
func (c *TradeController) RemoveCartItem(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.cart.Remove(member.ID, storeID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// UpdateSelection 勾选状态
// @Summary 更新购物车勾选
// @Tags cart
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.CartSelectionRequest true "全选标记或行项目 ID 列表"
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart/selection [put]
func (c *TradeController) UpdateSelection(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.CartSelectionRequest
	if !bindJSON(ctx, &req) {
		return
	}
	all := false
	if req.All != nil {
		all = *req.All
	}
	data, err := c.cart.SetSelection(member.ID, storeID, all, req.ItemIDs)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ClearCart 清空购物车
// @Summary 清空当前门店的购物车
// @Description 其他门店的行车保留，切回那家店仍在
// @Tags cart
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.CartData}
// @Router /api/cart [delete]
func (c *TradeController) ClearCart(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.cart.Clear(member.ID, storeID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CheckoutPreview 结算试算
// @Summary 结算页试算
// @Tags cart
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.CheckoutPreviewRequest true "地址、优惠券与结算行"
// @Success 200 {object} models.ApiResponse{data=models.CheckoutPreview}
// @Router /api/cart/checkout-preview [post]
func (c *TradeController) CheckoutPreview(ctx *gin.Context) {
	storeID, member, err := buyerScope(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.CheckoutPreviewRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := c.cart.CheckoutPreview(member.ID, storeID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ---------- 优惠券 ----------

// Vouchers 我的券包
// @Summary 我的券包
// @Tags voucher
// @Produce json
// @Security CookieAuth
// @Param amount query number false "购物车选中金额，用于计算 usable / gap_amount"
// @Success 200 {object} models.ApiResponse{data=models.VoucherList}
// @Router /api/vouchers [get]
func (c *TradeController) Vouchers(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.vouchers.Available(memberID, ctx.Query("amount"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// RedeemVoucher 兑换码领券
// @Summary 兑换码领取优惠券
// @Tags voucher
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.RedeemRequest true "兑换码"
// @Success 200 {object} models.ApiResponse{data=models.Voucher}
// @Failure 400 {object} models.ApiResponse "兑换码无效"
// @Failure 409 {object} models.ApiResponse "该兑换码已领取"
// @Router /api/vouchers/redeem [post]
func (c *TradeController) RedeemVoucher(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.RedeemRequest
	if !bindJSON(ctx, &req) {
		return
	}
	voucher, err := c.vouchers.Redeem(memberID, req.Code)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, voucher)
}

// AvailableVouchers 按金额判断可用券
// @Summary 按购物车金额判断可用券
// @Tags voucher
// @Produce json
// @Security CookieAuth
// @Param amount query string false "购物车选中金额"
// @Success 200 {object} models.ApiResponse{data=models.VoucherList}
// @Router /api/vouchers/available [get]
func (c *TradeController) AvailableVouchers(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.vouchers.Available(memberID, ctx.Query("amount"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// ---------- 收货地址 ----------

// Addresses 地址列表
// @Summary 收货地址列表
// @Tags address
// @Produce json
// @Security CookieAuth
// @Success 200 {object} models.ApiResponse{data=models.AddressList}
// @Router /api/addresses [get]
func (c *TradeController) Addresses(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.addresses.List(memberID)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CreateAddress 新增地址
// @Summary 新增收货地址
// @Description 首条地址自动设为默认
// @Tags address
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.AddressRequest true "标签与详细地址"
// @Success 200 {object} models.ApiResponse{data=models.Address}
// @Router /api/addresses [post]
func (c *TradeController) CreateAddress(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.AddressRequest
	if !bindJSON(ctx, &req) {
		return
	}
	address, err := c.addresses.Create(memberID, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, address)
}

// UpdateAddress 编辑地址
// @Summary 编辑收货地址
// @Tags address
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "地址 ID"
// @Param body body models.AddressRequest true "标签与详细地址"
// @Success 200 {object} models.ApiResponse{data=models.Address}
// @Router /api/addresses/{id} [patch]
func (c *TradeController) UpdateAddress(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.AddressRequest
	if !bindJSON(ctx, &req) {
		return
	}
	address, err := c.addresses.Update(memberID, ctx.Param("id"), &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, address)
}

// DeleteAddress 删除地址
// @Summary 删除收货地址
// @Description 删除默认地址后服务端回退到列表第一条
// @Tags address
// @Produce json
// @Security CookieAuth
// @Param id path string true "地址 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/addresses/{id} [delete]
func (c *TradeController) DeleteAddress(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := c.addresses.Delete(memberID, ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// SetDefaultAddress 设为默认
// @Summary 设为默认收货地址
// @Tags address
// @Produce json
// @Security CookieAuth
// @Param id path string true "地址 ID"
// @Success 200 {object} models.ApiResponse
// @Router /api/addresses/{id}/default [put]
func (c *TradeController) SetDefaultAddress(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	if err := c.addresses.SetDefault(memberID, ctx.Param("id")); err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, nil)
}

// ---------- 订单 ----------

// Orders 订单列表
// @Summary 订单列表
// @Tags order
// @Produce json
// @Security CookieAuth
// @Param tab query string false "ongoing / history"
// @Param page query int false "页码"
// @Param page_size query int false "每页条数，默认 6"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/orders [get]
func (c *TradeController) Orders(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	page, size := pageParam(ctx, 6)
	data, err := c.orders.List(memberID, ctx.Query("tab"), page, size)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// OrderDetail 订单详情
// @Summary 订单详情
// @Tags order
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/orders/{id} [get]
func (c *TradeController) OrderDetail(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.orders.Detail(memberID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// CreateOrder 下单
// @Summary 提交订单
// @Description 结算当前门店购物车的勾选行（或 item_ids），扣库存、占用优惠券并清空对应行
// @Tags order
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body models.CreateOrderRequest true "地址、优惠券与结算行"
// @Success 200 {object} models.ApiResponse{data=models.CreateOrderResult}
// @Failure 422 {object} models.ApiResponse "购物车为空 / 未达券门槛 / 无收货地址"
// @Router /api/orders [post]
func (c *TradeController) CreateOrder(ctx *gin.Context) {
	store, member, err := buyerStore(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	var req models.CreateOrderRequest
	if !bindJSON(ctx, &req) {
		return
	}
	result, err := c.orders.Create(member.ID, store, &req)
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, result)
}

// CancelOrder 取消订单
// @Summary 取消订单
// @Description 回补库存并退回优惠券
// @Tags order
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Success 200 {object} models.ApiResponse{data=models.Order}
// @Router /api/orders/{id}/cancel [post]
func (c *TradeController) CancelOrder(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.orders.Cancel(memberID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}

// TrackOrder 订单轨迹
// @Summary 订单物流轨迹
// @Tags order
// @Produce json
// @Security CookieAuth
// @Param id path string true "订单 ID"
// @Success 200 {object} models.ApiResponse{data=models.OrderTrack}
// @Router /api/orders/{id}/track [get]
func (c *TradeController) TrackOrder(ctx *gin.Context) {
	memberID, err := currentMemberID(ctx)
	if err != nil {
		fail(ctx, err)
		return
	}
	data, err := c.orders.Track(memberID, ctx.Param("id"))
	if err != nil {
		fail(ctx, err)
		return
	}
	ok(ctx, data)
}
