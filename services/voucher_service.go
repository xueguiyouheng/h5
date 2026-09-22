// services 业务逻辑层
// voucher_service.go 优惠券：券包查询、兑换码领取、按金额判断可用性
package services

import (
	"strconv"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// VoucherService 优惠券业务服务
type VoucherService struct{}

// NewVoucherService 创建优惠券服务实例
func NewVoucherService() *VoucherService { return &VoucherService{} }

// List 会员券包，附带上车可用标记
func (s *VoucherService) List(memberID string, amount float64) (*models.VoucherList, error) {
	var list []models.Voucher
	if err := findDocs(config.Collections.Vouchers, config.M(map[string]interface{}{"member_id": memberID}), "created_at", true, 50, 0, &list); err != nil {
		return nil, err
	}
	for i := range list {
		decorateVoucher(&list[i], amount)
	}
	if list == nil {
		list = []models.Voucher{}
	}
	return &models.VoucherList{List: list}, nil
}

// ByID 取会员名下的一张券
func (s *VoucherService) ByID(memberID, voucherID string) (*models.Voucher, error) {
	var voucher models.Voucher
	filter := config.M(map[string]interface{}{"_id": voucherID})
	if memberID != "" {
		filter["member_id"] = memberID
	}
	if err := findOneDoc(config.Collections.Vouchers, filter, &voucher); err != nil {
		return nil, err
	}
	if voucher.ID == "" {
		return nil, nil
	}
	return &voucher, nil
}

// decorateVoucher 计算 usable 与差额
func decorateVoucher(v *models.Voucher, amount float64) {
	minSpend := priceValue(v.MinSpend)
	gap := round2(minSpend - amount)
	if gap < 0 {
		gap = 0
	}
	v.GapAmount = money(gap)
	v.Usable = !v.Used && gap == 0 && v.ExpiredAt >= formatDate(time.Now().UTC())
}

// formatDate YYYY-MM-DD
func formatDate(t time.Time) string { return t.Format("2006-01-02") }

// Redeem 兑换码领取
func (s *VoucherService) Redeem(memberID, code string) (*models.Voucher, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, ErrBadRequest("请输入兑换码")
	}

	var tpl models.RedeemCode
	if err := findOneDoc(config.Collections.RedeemCodes, config.M(map[string]interface{}{"_id": code}), &tpl); err != nil {
		return nil, err
	}
	if tpl.Code == "" {
		return nil, ErrBadRequest("兑换码无效")
	}

	existing, err := s.findMemberVoucherByCode(memberID, code)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrConflict("该兑换码已领取")
	}

	days := tpl.ValidityDays
	if days <= 0 {
		days = 90
	}
	now := time.Now().UTC()
	voucher := &models.Voucher{
		ID:          newID(),
		MemberID:    memberID,
		Title:       voucherTitle(tpl.Kind, tpl.Value),
		Kind:        tpl.Kind,
		Value:       tpl.Value,
		MinSpend:    normalizePrice(tpl.MinSpend),
		Description: tpl.Description,
		ExpiredAt:   formatDate(now.AddDate(0, 0, days)),
		Source:      "redeem_code",
		RedeemCode:  code,
		CreatedAt:   now,
	}
	if err := insertDoc(config.Collections.Vouchers, voucher); err != nil {
		if isDuplicateErr(err) {
			return nil, ErrConflict("该兑换码已领取")
		}
		return nil, err
	}
	decorateVoucher(voucher, 0)
	return voucher, nil
}

// findMemberVoucherByCode 查会员是否已用该码领券
func (s *VoucherService) findMemberVoucherByCode(memberID, code string) (*models.Voucher, error) {
	var voucher models.Voucher
	if err := findOneDoc(config.Collections.Vouchers, config.M(map[string]interface{}{
		"member_id":   memberID,
		"redeem_code": code,
	}), &voucher); err != nil {
		return nil, err
	}
	if voucher.ID == "" {
		return nil, nil
	}
	return &voucher, nil
}

// voucherTitle 券面标题，与前端展示口径一致
func voucherTitle(kind string, value int) string {
	switch kind {
	case "percent":
		return strconv.Itoa(value) + "%"
	case "shipping":
		return "Free Shipping"
	default:
		return "$" + money(float64(value))
	}
}

// MarkUsed 订单占用优惠券
func (s *VoucherService) MarkUsed(voucherID string) error {
	if voucherID == "" {
		return nil
	}
	return updateDoc(config.Collections.Vouchers, voucherID, config.M(map[string]interface{}{"used": true}))
}

// Release 订单取消后退回优惠券
func (s *VoucherService) Release(voucherID string) error {
	if voucherID == "" {
		return nil
	}
	return updateDoc(config.Collections.Vouchers, voucherID, config.M(map[string]interface{}{"used": false}))
}

// Available 按购物车金额返回券包及可用性，供结算页选择
func (s *VoucherService) Available(memberID, amount string) (*models.VoucherList, error) {
	return s.List(memberID, priceValue(amount))
}
