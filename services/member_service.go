// services 业务逻辑层
// member_service.go 商城会员注册、登录查找、资料维护与密码找回
// 会员数据存放在 MongoDB freshmart.members
package services

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"

	"golang.org/x/crypto/bcrypt"
)

// MemberService 会员业务服务
type MemberService struct{}

// NewMemberService 创建会员服务实例
func NewMemberService() *MemberService { return &MemberService{} }

var (
	emailRe  = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)
	nameRe   = regexp.MustCompile(`^[A-Za-z .'-]+$`)
	mobileRe = regexp.MustCompile(`^1[3-9]\d{9}$`)
	codeRe   = regexp.MustCompile(`^\d{6}$`)
)

// ValidateUsername 姓名需 3-24 个字符，且仅允许字母、空格与 . ' -
func ValidateUsername(v string) string {
	v = strings.TrimSpace(v)
	if len(v) < 3 || len(v) > 24 {
		return "姓名需 3-24 个字符"
	}
	if !nameRe.MatchString(v) {
		return "姓名仅支持字母、空格与 . ' -"
	}
	return ""
}

// ValidateEmail 邮箱格式校验
func ValidateEmail(v string) string {
	v = strings.TrimSpace(v)
	if !emailRe.MatchString(v) {
		return "邮箱格式不正确"
	}
	return ""
}

// ValidatePassword 密码强度校验
func ValidatePassword(v string) string {
	if len(v) < 8 {
		return "密码至少 8 位"
	}
	return ""
}

// NormalizeMobile 抽出比对与存储用的手机号：去掉空格、连字符与国家码前缀
// 校验、查重、入库必须走同一个函数，否则 +8613800138000 与 13800138000 会绕过唯一索引变成两个账号
func NormalizeMobile(v string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, v)
	if len(digits) == 13 && strings.HasPrefix(digits, "86") {
		digits = digits[2:]
	}
	return digits
}

// ValidateMobile 中国大陆手机号：11 位、1 开头、第二位 3-9；展示与存储都不带国家码
func ValidateMobile(v string) string {
	if !mobileRe.MatchString(NormalizeMobile(v)) {
		return "请输入 11 位中国大陆手机号，如 13800138000"
	}
	return ""
}

// ValidateStore 商家注册的门店资料校验，门店地址是卖家发货地，与买家的收货地址无关
func ValidateStore(name, address string) string {
	if n := len([]rune(strings.TrimSpace(name))); n < 2 || n > 30 {
		return "门店名称需 2-30 个字符"
	}
	if len([]rune(strings.TrimSpace(address))) < 6 {
		return "门店地址至少 6 个字符"
	}
	return ""
}

// firstMessage 返回第一条非空校验提示
func firstMessage(msgs ...string) string {
	for _, m := range msgs {
		if m != "" {
			return m
		}
	}
	return ""
}

// Register 注册会员
func (s *MemberService) Register(req *models.RegisterRequest) (*models.RegisterResult, error) {
	if err := checkMongo(); err != nil {
		return nil, err
	}

	if msg := firstMessage(
		ValidateUsername(req.Username),
		ValidateEmail(req.Email),
		ValidatePassword(req.Password),
		ValidateMobile(req.Mobile),
	); msg != "" {
		return nil, ErrBadRequest(msg)
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	mobile := NormalizeMobile(req.Mobile)
	if exists, _ := s.FindByAccount(email); exists != nil {
		return nil, ErrConflict("该邮箱已被注册")
	}
	if exists, _ := s.FindByMobile(mobile); exists != nil {
		return nil, ErrConflict("该手机号已被注册")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	accountType := strings.ToLower(strings.TrimSpace(req.AccountType))
	if accountType == "" {
		accountType = models.AccountTypeBuyer
	}
	if accountType != models.AccountTypeBuyer && accountType != models.AccountTypeMerchant {
		return nil, ErrBadRequest("账号类型只能是买家或商家")
	}
	// 门店地址随注册一起收，之后商家在中台「门店资料」里改
	if accountType == models.AccountTypeMerchant {
		if msg := ValidateStore(req.StoreName, req.StoreAddress); msg != "" {
			return nil, ErrBadRequest(msg)
		}
	}

	now := time.Now().UTC()
	member := &models.Member{
		ID:          newID(),
		Username:    strings.TrimSpace(req.Username),
		Email:       email,
		Mobile:      mobile,
		Password:    string(hash),
		Language:    "en",
		AccountType: accountType,
		Onboarded:   false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := insertDoc(config.Collections.Members, member); err != nil {
		if isDuplicateErr(err) {
			return nil, ErrConflict("该邮箱或手机号已被注册")
		}
		return nil, err
	}

	result := &models.RegisterResult{ID: member.ID, Email: email, AccountType: accountType}
	// 商家注册即建店，账号本身仍保留全部买家能力；入驻审核流程后期再补，见 CreateStore 的 TODO
	if accountType == models.AccountTypeMerchant {
		store, err := NewShopService().CreateStore(member.ID, req.StoreName, req.StoreAddress, req.Longitude, req.Latitude)
		if err != nil {
			return nil, err
		}
		result.OwnedStoreID = store.ID
		if err := updateDoc(config.Collections.Members, member.ID, config.M(map[string]interface{}{
			"default_store_id": store.ID,
			"updated_at":       time.Now().UTC(),
		})); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// FindByAccount 按邮箱、用户名或手机号查会员，是登录与找回的唯一凭据入口
func (s *MemberService) FindByAccount(account string) (*models.Member, error) {
	account = strings.TrimSpace(account)
	if account == "" {
		return nil, nil
	}
	var member models.Member
	filter := config.M(map[string]interface{}{
		"$or": []map[string]interface{}{
			{"email": strings.ToLower(account)},
			{"username": account},
			// 手机号可登录：库内存的是 NormalizeMobile 之后的纯数字
			{"mobile": NormalizeMobile(account)},
		},
	})
	if err := findOneDoc(config.Collections.Members, filter, &member); err != nil {
		return nil, err
	}
	if member.ID == "" {
		return nil, nil
	}
	return &member, nil
}

// FindByMobile 按手机号查会员
func (s *MemberService) FindByMobile(mobile string) (*models.Member, error) {
	var member models.Member
	if err := findOneDoc(config.Collections.Members, config.M(map[string]interface{}{"mobile": mobile}), &member); err != nil {
		return nil, err
	}
	if member.ID == "" {
		return nil, nil
	}
	return &member, nil
}

// ByID 按主键查会员
func (s *MemberService) ByID(id string) (*models.Member, error) {
	var member models.Member
	if err := findOneDoc(config.Collections.Members, config.M(map[string]interface{}{"_id": id}), &member); err != nil {
		return nil, err
	}
	if member.ID == "" {
		return nil, nil
	}
	return &member, nil
}

// VerifyPassword 校验明文密码
func VerifyPassword(member *models.Member, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(member.Password), []byte(plain)) == nil
}

// hashPassword 生成 bcrypt 哈希
func hashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(b), err
}

// UpdateProfile 更新资料；改密码必须带原密码
func (s *MemberService) UpdateProfile(id string, req *models.UpdateMemberRequest) (*models.Member, error) {
	member, err := s.ByID(id)
	if err != nil {
		return nil, err
	}
	if member == nil {
		return nil, ErrNotFound("会员不存在")
	}

	fields := map[string]interface{}{"updated_at": time.Now().UTC()}

	if req.Username != "" {
		if msg := ValidateUsername(req.Username); msg != "" {
			return nil, ErrBadRequest(msg)
		}
		fields["username"] = strings.TrimSpace(req.Username)
	}
	if req.Email != "" {
		if msg := ValidateEmail(req.Email); msg != "" {
			return nil, ErrBadRequest(msg)
		}
		email := strings.ToLower(strings.TrimSpace(req.Email))
		if email != member.Email {
			if other, _ := s.FindByAccount(email); other != nil {
				return nil, ErrConflict("该邮箱已被注册")
			}
		}
		fields["email"] = email
	}
	if req.Mobile != "" {
		if msg := ValidateMobile(req.Mobile); msg != "" {
			return nil, ErrBadRequest(msg)
		}
		mobile := NormalizeMobile(req.Mobile)
		if mobile != member.Mobile {
			if other, _ := s.FindByMobile(mobile); other != nil {
				return nil, ErrConflict("该手机号已被注册")
			}
		}
		fields["mobile"] = mobile
	}
	if req.Gender != "" {
		if req.Gender != "male" && req.Gender != "female" && req.Gender != "other" {
			return nil, ErrBadRequest("性别取值不合法")
		}
		fields["gender"] = req.Gender
	}
	if req.AvatarURL != "" {
		fields["avatar_url"] = strings.TrimSpace(req.AvatarURL)
	}
	if req.Password != "" {
		if msg := ValidatePassword(req.Password); msg != "" {
			return nil, ErrBadRequest(msg)
		}
		if req.OldPassword == "" {
			return nil, ErrBadRequest("修改密码需提供原密码")
		}
		if !VerifyPassword(member, req.OldPassword) {
			return nil, ErrBadRequest("原密码不正确")
		}
		hash, err := hashPassword(req.Password)
		if err != nil {
			return nil, err
		}
		fields["password"] = hash
	}

	if err := updateDoc(config.Collections.Members, id, config.M(fields)); err != nil {
		return nil, err
	}
	return s.ByID(id)
}

// MarkOnboarded 引导页完成后置位
func (s *MemberService) MarkOnboarded(id string) {
	_ = updateDoc(config.Collections.Members, id, config.M(map[string]interface{}{"onboarded": true}))
}

// Completeness 资料完整度：姓名/邮箱/手机/密码/性别 五项
func (s *MemberService) Completeness(member *models.Member) *models.Completeness {
	done := 0
	total := 5
	if strings.TrimSpace(member.Username) != "" {
		done++
	}
	if strings.TrimSpace(member.Email) != "" {
		done++
	}
	if strings.TrimSpace(member.Mobile) != "" {
		done++
	}
	if strings.TrimSpace(member.Password) != "" {
		done++
	}
	if strings.TrimSpace(member.Gender) != "" {
		done++
	}
	return &models.Completeness{Done: done, Total: total, Percent: done * 100 / total}
}

// EnsureForSSOUser 后台账号（MySQL users）首次访问商城数据时自动建会员档案
func (s *MemberService) EnsureForSSOUser(userID int, username string) (*models.Member, error) {
	var member models.Member
	if err := findOneDoc(config.Collections.Members, config.M(map[string]interface{}{"sso_user_id": userID}), &member); err != nil {
		return nil, err
	}
	if member.ID != "" {
		return &member, nil
	}

	email := username
	if strings.Contains(username, "@") {
		email = strings.ToLower(username)
	} else {
		email = strings.ToLower(username) + "@sso.local"
	}
	hash, err := hashPassword(newID())
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	member = models.Member{
		ID:          newID(),
		Username:    username,
		Email:       email,
		Password:    hash,
		Language:    "en",
		AccountType: models.AccountTypeBuyer,
		Onboarded:   true,
		SSOUserID:   userID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := insertDoc(config.Collections.Members, &member); err != nil {
		return nil, err
	}
	return &member, nil
}

// RequestReset 发起找回密码；邮箱不存在也返回成功，避免账号枚举
func (s *MemberService) RequestReset(email string) (*models.ResetPasswordResult, error) {
	member, err := s.FindByAccount(strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return nil, err
	}
	res := &models.ResetPasswordResult{Sent: true, Channel: "email"}
	if member == nil {
		return res, nil
	}
	code := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	_ = updateDoc(config.Collections.Members, member.ID, config.M(map[string]interface{}{
		"reset_code": code,
		"reset_at":   time.Now().UTC(),
	}))
	return res, nil
}

// VerifyReset 校验验证码并重置密码
func (s *MemberService) VerifyReset(code, newPassword string) error {
	if !codeRe.MatchString(strings.TrimSpace(code)) {
		return ErrBadRequest("验证码为 6 位数字")
	}
	if msg := ValidatePassword(newPassword); msg != "" {
		return ErrBadRequest(msg)
	}
	var member models.Member
	if err := findOneDoc(config.Collections.Members, config.M(map[string]interface{}{"reset_code": strings.TrimSpace(code)}), &member); err != nil {
		return err
	}
	if member.ID == "" {
		return ErrBadRequest("验证码无效")
	}
	if time.Since(member.ResetAt) > 30*time.Minute {
		return ErrBadRequest("验证码已过期，请重新获取")
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	return updateDoc(config.Collections.Members, member.ID, config.M(map[string]interface{}{
		"password":   hash,
		"reset_code": "",
		"updated_at": time.Now().UTC(),
	}))
}
