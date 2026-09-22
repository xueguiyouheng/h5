// services 业务逻辑层
// address_service.go 收货地址：增删改查与默认地址回退
package services

import (
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// AddressService 地址业务服务
type AddressService struct{}

// NewAddressService 创建地址服务实例
func NewAddressService() *AddressService { return &AddressService{} }

// List 会员地址列表 + 默认地址 ID
func (s *AddressService) List(memberID string) (*models.AddressList, error) {
	var list []models.Address
	if err := findDocs(config.Collections.Addresses, config.M(map[string]interface{}{"member_id": memberID}), "updated_at", true, 50, 0, &list); err != nil {
		return nil, err
	}
	out := &models.AddressList{List: list, DefaultID: ""}
	if out.List == nil {
		out.List = []models.Address{}
	}
	for _, item := range out.List {
		if item.IsDefault {
			out.DefaultID = item.ID
			break
		}
	}
	if out.DefaultID == "" && len(out.List) > 0 {
		out.DefaultID = out.List[0].ID
		_ = updateDoc(config.Collections.Addresses, out.List[0].ID, config.M(map[string]interface{}{"is_default": true}))
	}
	return out, nil
}

// ByID 取会员名下的一条地址
func (s *AddressService) ByID(memberID, id string) (*models.Address, error) {
	var address models.Address
	if err := findOneDoc(config.Collections.Addresses, config.M(map[string]interface{}{
		"_id":       id,
		"member_id": memberID,
	}), &address); err != nil {
		return nil, err
	}
	if address.ID == "" {
		return nil, nil
	}
	return &address, nil
}

// ValidateAddress 校验标签与详细地址
// 详细地址必须能用逗号拆成「街道 / 其余」两段，供前端 formatAddressLines 使用
func ValidateAddress(label, detail string) string {
	label = strings.TrimSpace(label)
	if len(label) < 2 || len(label) > 16 {
		return "标签需 2-16 个字符"
	}
	detail = strings.TrimSpace(detail)
	if len(detail) < 12 {
		return "详细地址至少 12 个字符"
	}
	parts := strings.Split(detail, ",")
	if len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
		return "详细地址需用逗号分隔街道与地区"
	}
	return ""
}

// Create 新增地址，首条自动设为默认
func (s *AddressService) Create(memberID string, req *models.AddressRequest) (*models.Address, error) {
	if msg := ValidateAddress(req.Label, req.Detail); msg != "" {
		return nil, ErrBadRequest(msg)
	}
	current, err := s.List(memberID)
	if err != nil {
		return nil, err
	}
	isDefault := req.AsDefault || len(current.List) == 0

	now := time.Now().UTC()
	address := &models.Address{
		ID:        newID(),
		MemberID:  memberID,
		Label:     strings.TrimSpace(req.Label),
		Detail:    strings.TrimSpace(req.Detail),
		IsDefault: isDefault,
		UpdatedAt: now,
	}
	if err := insertDoc(config.Collections.Addresses, address); err != nil {
		return nil, err
	}
	if isDefault {
		if err := s.clearOtherDefaults(memberID, address.ID); err != nil {
			return nil, err
		}
	}
	return address, nil
}

// Update 编辑地址标签或详细地址
func (s *AddressService) Update(memberID, id string, req *models.AddressRequest) (*models.Address, error) {
	address, err := s.ByID(memberID, id)
	if err != nil {
		return nil, err
	}
	if address == nil {
		return nil, ErrNotFound("地址不存在")
	}
	label := firstNonEmpty(req.Label, address.Label)
	detail := firstNonEmpty(req.Detail, address.Detail)
	if msg := ValidateAddress(label, detail); msg != "" {
		return nil, ErrBadRequest(msg)
	}
	fields := config.M(map[string]interface{}{
		"label":      strings.TrimSpace(label),
		"detail":     strings.TrimSpace(detail),
		"updated_at": time.Now().UTC(),
	})
	if req.AsDefault {
		fields["is_default"] = true
	}
	if err := updateDoc(config.Collections.Addresses, id, fields); err != nil {
		return nil, err
	}
	if req.AsDefault {
		if err := s.clearOtherDefaults(memberID, id); err != nil {
			return nil, err
		}
	}
	return s.ByID(memberID, id)
}

// Delete 删除地址；删掉默认地址后回退到列表第一条
func (s *AddressService) Delete(memberID, id string) error {
	address, err := s.ByID(memberID, id)
	if err != nil {
		return err
	}
	if address == nil {
		return ErrNotFound("地址不存在")
	}
	if err := deleteDoc(config.Collections.Addresses, id); err != nil {
		return err
	}
	if !address.IsDefault {
		return nil
	}
	list, err := s.List(memberID)
	if err != nil {
		return err
	}
	if list.DefaultID != "" {
		return updateDoc(config.Collections.Addresses, list.DefaultID, config.M(map[string]interface{}{"is_default": true}))
	}
	return nil
}

// SetDefault 设为默认地址
func (s *AddressService) SetDefault(memberID, id string) error {
	address, err := s.ByID(memberID, id)
	if err != nil {
		return err
	}
	if address == nil {
		return ErrNotFound("地址不存在")
	}
	if err := updateDoc(config.Collections.Addresses, id, config.M(map[string]interface{}{"is_default": true})); err != nil {
		return err
	}
	return s.clearOtherDefaults(memberID, id)
}

// clearOtherDefaults 取消其余地址的默认标记
func (s *AddressService) clearOtherDefaults(memberID, keepID string) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Addresses).UpdateMany(ctx,
		config.M(map[string]interface{}{"member_id": memberID, "_id": map[string]interface{}{"$ne": keepID}}),
		config.M(map[string]interface{}{"$set": map[string]interface{}{"is_default": false}}),
	)
	return err
}
