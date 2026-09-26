// services 业务逻辑层
// cart_service.go 购物车：行项目读写与金额试算
// 运费与优惠全部在服务端计算，前端不再求和
package services

import (
	"time"

	"go-gin/config"
	"go-gin/models"
)

// CartService 购物车业务服务
type CartService struct {
	shop *ShopService
}

// NewCartService 创建购物车服务实例
func NewCartService() *CartService {
	return &CartService{shop: NewShopService()}
}

// maxCartQty 单个行项目的数量上限
const maxCartQty = 20

// maxBatchAdd 批量加购的条数上限，收藏页「一键加入购物车」用它兜住异常大的请求
const maxBatchAdd = 100

// freeDeliveryThreshold 免运费门槛（美元）
const freeDeliveryThreshold = 20.00

// baseDeliveryFee 未达门槛时的基础运费
const baseDeliveryFee = 5.00

// cartCurrency 单会员购物车只允许一种币种，取第一件商品的币种
const cartCurrency = "USD"

// load 读取购物车，不存在时返回空车
func (s *CartService) load(memberID string) (*models.Cart, error) {
	var cart models.Cart
	if err := findOneDoc(config.Collections.Carts, config.M(map[string]interface{}{"member_id": memberID}), &cart); err != nil {
		return nil, err
	}
	if cart.ID == "" {
		cart = models.Cart{MemberID: memberID, Lines: []models.CartLine{}}
	}
	if cart.Lines == nil {
		cart.Lines = []models.CartLine{}
	}
	return &cart, nil
}

// save 整体回写购物车
func (s *CartService) save(cart *models.Cart) error {
	cart.UpdatedAt = time.Now().UTC()
	if cart.ID == "" {
		cart.ID = newID()
		return insertDoc(config.Collections.Carts, cart)
	}
	return replaceDoc(config.Collections.Carts, cart.ID, cart)
}

// items 联表商品，取实时价格/图片/库存组装购物车行项目
// 一单一店：只回当前门店的行，别家店的行留在车上，切回那家店才看得到
func (s *CartService) items(memberID, storeID string) ([]models.CartItem, error) {
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}

	items := make([]models.CartItem, 0, len(cart.Lines))
	for _, line := range cart.Lines {
		if storeID != "" && line.StoreID != storeID {
			continue
		}
		product, err := s.shop.ProductByID(line.ProductID)
		if err != nil {
			// 商品已下架或删除：跳过该行，不阻塞整车渲染
			continue
		}
		qty := line.Qty
		if qty > maxCartQty {
			qty = maxCartQty
		}
		items = append(items, models.CartItem{
			ID:        line.ProductID,
			ProductID: product.ID,
			Name:      product.Name,
			Price:     product.Price,
			Currency:  product.Currency,
			Unit:      product.Unit,
			ImageURL:  product.ImageURL,
			Qty:       qty,
			Selected:  line.Selected,
			LineTotal: money(round2(priceValue(product.Price) * float64(qty))),
			MaxQty:    maxCartQty,
			Available: product.Stock,
		})
	}
	return items, nil
}

// View 组装购物车出参：行项目 + 选中金额/运费/应付
func (s *CartService) View(memberID, storeID, voucherID string) (*models.CartData, error) {
	items, err := s.items(memberID, storeID)
	if err != nil {
		return nil, err
	}

	var voucher *models.Voucher
	if voucherID != "" {
		v, err := NewVoucherService().ByID(memberID, voucherID)
		if err != nil {
			return nil, err
		}
		if v == nil {
			return nil, ErrNotFound("优惠券不存在")
		}
		voucher = v
	}

	data, _ := ComputeTotals(items, voucher, voucherID)
	return data, nil
}

// ComputeTotals 金额试算：小计 → 券抵扣 → 运费 → 应付
// 第二个返回值是优惠券不可用的原因，可用时为空串
func ComputeTotals(items []models.CartItem, voucher *models.Voucher, voucherID string) (*models.CartData, string) {
	var subtotal, selectedTotal float64
	for _, item := range items {
		line := priceValue(item.Price) * float64(item.Qty)
		subtotal += line
		if item.Selected {
			selectedTotal += line
		}
	}

	data := &models.CartData{
		Items:                 items,
		Currency:              cartCurrency,
		Subtotal:              money(round2(subtotal)),
		SelectedTotal:         money(round2(selectedTotal)),
		FreeDeliveryThreshold: money(freeDeliveryThreshold),
		Discount:              "0.00",
		AppliedVoucherID:      "",
	}

	fee := baseDeliveryFee
	if selectedTotal >= freeDeliveryThreshold {
		fee = 0
	}

	reason := ""
	if voucher != nil {
		if voucher.Used {
			reason = "该优惠券已使用"
		} else if priceValue(voucher.MinSpend) > selectedTotal {
			reason = "订单金额未达优惠券门槛"
		} else {
			discount, waived := applyVoucher(voucher, selectedTotal, &fee)
			data.Discount = money(discount)
			data.AppliedVoucherID = voucherID
			if waived {
				reason = ""
			}
		}
	}
	data.DeliveryFee = money(fee)

	payable := selectedTotal - priceValue(data.Discount) + priceValue(data.DeliveryFee)
	if payable < 0 {
		payable = 0
	}
	data.Payable = money(round2(payable))
	return data, reason
}

// Add 加入商品，已存在则累加数量
func (s *CartService) Add(memberID, storeID, productID string, qty int) (*models.CartData, error) {
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}
	if err := s.mergeLine(cart, storeID, productID, qty); err != nil {
		return nil, err
	}
	if err := s.save(cart); err != nil {
		return nil, err
	}
	return s.View(memberID, storeID, "")
}

// AddMany 批量加购：一次读改写，任一条不合规就整批不落到车上
func (s *CartService) AddMany(memberID, storeID string, items []models.CartAddItem) (*models.CartData, error) {
	if len(items) == 0 {
		return nil, ErrBadRequest("没有要加入的商品")
	}
	if len(items) > maxBatchAdd {
		return nil, newErr(422, "单次最多加入 %d 件", maxBatchAdd)
	}
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if err := s.mergeLine(cart, storeID, item.ProductID, item.Qty); err != nil {
			return nil, err
		}
	}
	if err := s.save(cart); err != nil {
		return nil, err
	}
	return s.View(memberID, storeID, "")
}

// mergeLine 把商品并进内存快照：校验上架与库存，已存在则累加并勾选
func (s *CartService) mergeLine(cart *models.Cart, storeID, productID string, qty int) error {
	if qty <= 0 {
		qty = 1
	}
	product, err := s.shop.ProductByID(productID)
	if err != nil {
		return err
	}
	// 一单一店是硬约束：前端加购前会自动切到商品所属门店，走到这里说明请求绕过了那一步
	if storeID != "" && product.StoreID != "" && product.StoreID != storeID {
		return ErrUnprocessable("该商品属于其他门店，请先切换到对应门店")
	}
	if product.Status != "on" {
		return newErr(422, "「%s」已下架", product.Name)
	}
	// 车上已有的量要一起算，否则分几次加就能把库存加超
	existing := 0
	for _, line := range cart.Lines {
		if line.ProductID == productID {
			existing = line.Qty
			break
		}
	}
	if existing+qty > product.Stock {
		return newErr(422, "「%s」库存不足，仅剩 %d 件", product.Name, product.Stock)
	}
	for i := range cart.Lines {
		if cart.Lines[i].ProductID == productID {
			cart.Lines[i].Qty += qty
			if cart.Lines[i].Qty > maxCartQty {
				cart.Lines[i].Qty = maxCartQty
			}
			cart.Lines[i].Selected = true
			return nil
		}
	}
	cart.Lines = append(cart.Lines, models.CartLine{ProductID: productID, StoreID: product.StoreID, Qty: qty, Selected: true})
	return nil
}

// SetQty 修改数量，qty<=0 视为删除
func (s *CartService) SetQty(memberID, storeID, productID string, qty int) (*models.CartData, error) {
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}
	if qty > maxCartQty {
		qty = maxCartQty
	}
	next := make([]models.CartLine, 0, len(cart.Lines))
	found := false
	for _, line := range cart.Lines {
		if line.ProductID == productID && (storeID == "" || line.StoreID == storeID) {
			found = true
			if qty <= 0 {
				continue
			}
			line.Qty = qty
		}
		next = append(next, line)
	}
	if !found {
		return nil, ErrNotFound("购物车中没有该商品")
	}
	cart.Lines = next
	if err := s.save(cart); err != nil {
		return nil, err
	}
	return s.View(memberID, storeID, "")
}

// Remove 删除行项目
func (s *CartService) Remove(memberID, storeID, productID string) (*models.CartData, error) {
	return s.SetQty(memberID, storeID, productID, 0)
}

// SetSelection 全选或按 ID 勾选，只作用在当前门店的行上
func (s *CartService) SetSelection(memberID, storeID string, all bool, itemIDs []string) (*models.CartData, error) {
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}
	wanted := map[string]bool{}
	for _, id := range itemIDs {
		wanted[id] = true
	}
	for i := range cart.Lines {
		if storeID != "" && cart.Lines[i].StoreID != storeID {
			continue
		}
		if all {
			cart.Lines[i].Selected = true
		} else if len(itemIDs) > 0 {
			cart.Lines[i].Selected = wanted[cart.Lines[i].ProductID]
		} else {
			cart.Lines[i].Selected = false
		}
	}
	if err := s.save(cart); err != nil {
		return nil, err
	}
	return s.View(memberID, storeID, "")
}

// Clear 清空当前门店的车，别家门店的行原样保留
func (s *CartService) Clear(memberID, storeID string) (*models.CartData, error) {
	cart, err := s.load(memberID)
	if err != nil {
		return nil, err
	}
	kept := make([]models.CartLine, 0, len(cart.Lines))
	for _, line := range cart.Lines {
		if storeID != "" && line.StoreID == storeID {
			continue
		}
		kept = append(kept, line)
	}
	cart.Lines = kept
	if err := s.save(cart); err != nil {
		return nil, err
	}
	return s.View(memberID, storeID, "")
}

// CheckoutPreview 结算页试算：按 item_ids 或当前勾选行计算，附带地址与预计送达时间
func (s *CartService) CheckoutPreview(memberID, storeID string, req *models.CheckoutPreviewRequest) (*models.CheckoutPreview, error) {
	data, reason, items, err := s.preview(memberID, storeID, req.AddressID, req.VoucherID, req.ItemIDs)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, ErrUnprocessable("请先选择要结算的商品")
	}
	out := &models.CheckoutPreview{CartData: *data, ETA: deliveryETA(), VoucherRejectedReason: reason}
	if req.AddressID != "" {
		address, err := NewAddressService().ByID(memberID, req.AddressID)
		if err != nil {
			return nil, err
		}
		if address == nil {
			return nil, ErrNotFound("收货地址不存在")
		}
		out.Address = address
	}
	return out, nil
}

// preview 共用试算逻辑，同时回传参与计算的行项目
func (s *CartService) preview(memberID, storeID, addressID, voucherID string, itemIDs []string) (*models.CartData, string, []models.CartItem, error) {
	items, err := s.items(memberID, storeID)
	if err != nil {
		return nil, "", nil, err
	}
	if len(itemIDs) > 0 {
		wanted := map[string]bool{}
		for _, id := range itemIDs {
			wanted[id] = true
		}
		filtered := make([]models.CartItem, 0, len(items))
		for _, item := range items {
			if wanted[item.ProductID] {
				item.Selected = true
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	var voucher *models.Voucher
	if voucherID != "" {
		v, err := NewVoucherService().ByID(memberID, voucherID)
		if err != nil {
			return nil, "", nil, err
		}
		if v == nil {
			return nil, "", nil, ErrNotFound("优惠券不存在")
		}
		voucher = v
	}
	data, reason := ComputeTotals(items, voucher, voucherID)
	return data, reason, items, nil
}

// deliveryETA 预计送达时间：下单后 90 分钟
func deliveryETA() string {
	return time.Now().UTC().Add(90 * time.Minute).Format(time.RFC3339)
}

// applyVoucher 计算券抵扣额，返回抵扣金额与是否免运费
func applyVoucher(voucher *models.Voucher, selectedTotal float64, fee *float64) (float64, bool) {
	if priceValue(voucher.MinSpend) > selectedTotal {
		return 0, false
	}
	switch voucher.Kind {
	case "percent":
		return round2(selectedTotal * float64(voucher.Value) / 100), false
	case "shipping":
		*fee = 0
		return 0, true
	case "fixed":
		discount := float64(voucher.Value)
		if discount > selectedTotal {
			discount = selectedTotal
		}
		return round2(discount), false
	default:
		return 0, false
	}
}
