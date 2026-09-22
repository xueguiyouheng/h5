// services 业务逻辑层
// mp_auth_service.go 小程序授权登录：平台凭证 → 身份 → 按手机号合并账号 → 签发与 H5 同构的令牌
//
// 安全边界（docs/miniprogram-plan.md §6）：合并主键只认平台解密出来的手机号。
// 请求体里根本没有手机号字段，只有平台的 code，因此手填号码、改包都构造不出「别人的手机号授权」；
// 拿到该手机号平台凭证的人即拥有该账号的订单与地址可见性，这是这条链路的既有代价，不往外扩。
package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"go-gin/config"
	"go-gin/models"
	"go-gin/utils"
)

// MPAuthService 小程序账号业务服务
type MPAuthService struct{}

// NewMPAuthService 创建小程序账号服务实例
func NewMPAuthService() *MPAuthService { return &MPAuthService{} }

// mpPlaceholderName 姓名校验只收字母（member_service.go 的 nameRe），手机号编不进去；
// 小程序没有手填姓名这一步，先给固定占位，用户可在资料页改成自己的名字
const mpPlaceholderName = "Wechat User"

// mpHTTPClient 身份换取外呼客户端
var mpHTTPClient = &http.Client{Timeout: mpWxTimeout}

// WxIdentity 微信平台换回来的身份
// 结构里没有 session_key：静默换取的响应带它，但本站不做会话加密，不接进进程就没有泄露面
type WxIdentity struct {
	OpenID  string // 本小程序内的用户标识，绑定后是登录的唯一入口
	UnionID string // 同主体下的稳定标识，当前只入库留档
	Mobile  string // 平台授权的手机号，已归一化；用户未授权时为空
}

// WechatLogin 微信小程序授权登录
// openid 已入库 → 直接签发令牌；未入库 → 用平台授权的手机号合并已有账号或新建买家账号
func (s *MPAuthService) WechatLogin(ctx context.Context, code, phoneCode string) (*models.LoginResponse, error) {
	if err := checkMongo(); err != nil {
		return nil, err
	}
	identity, err := resolveWxIdentity(ctx, code, phoneCode)
	if err != nil {
		return nil, err
	}

	member, err := findMemberByWxOpenID(identity.OpenID)
	if err != nil {
		return nil, err
	}
	if member == nil {
		if member, err = mergeByMobile(identity); err != nil {
			return nil, err
		}
	}
	return issueMemberToken(member)
}

// BindWechat 把微信身份绑到当前登录的会员上
// 用于「拒绝手机号授权 → 用密码登录 H5 同套账号 → 再绑微信」这条路，绑完下次静默登录即命中
func (s *MPAuthService) BindWechat(ctx context.Context, memberID, code string) error {
	if err := checkMongo(); err != nil {
		return err
	}
	identity, err := resolveWxIdentity(ctx, code, "")
	if err != nil {
		return err
	}
	other, err := findMemberByWxOpenID(identity.OpenID)
	if err != nil {
		return err
	}
	if other != nil {
		if other.ID != memberID {
			return ErrConflict("该微信已绑定其他账号")
		}
		return nil
	}
	return bindWxIdentity(memberID, identity)
}

// mergeByMobile 手机号命中则写入微信身份（合并），未命中则新建买家账号
func mergeByMobile(identity *WxIdentity) (*models.Member, error) {
	if identity.Mobile == "" {
		return nil, ErrUnprocessable("需要授权手机号才能完成登录")
	}
	member, err := NewMemberService().FindByMobile(identity.Mobile)
	if err != nil {
		return nil, err
	}
	if member == nil {
		return createMPMember(identity)
	}
	if member.WxOpenID != "" && member.WxOpenID != identity.OpenID {
		return nil, ErrConflict("该手机号已绑定其他微信，请先解绑或用密码登录")
	}
	if err := bindWxIdentity(member.ID, identity); err != nil {
		return nil, err
	}
	member.WxOpenID = identity.OpenID
	if identity.UnionID != "" {
		member.WxUnionID = identity.UnionID
	}
	return member, nil
}

// createMPMember 小程序新建的账号一律买家：商家要填门店名称与地址，那是 H5 注册页的能力
// Onboarded 直接置真：引导页是 H5 的产物，小程序没这一屏，留假会让首登卡在看不到的页面上
func createMPMember(identity *WxIdentity) (*models.Member, error) {
	hash, err := hashPassword(newID())
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	member := &models.Member{
		ID:          newID(),
		Username:    mpPlaceholderName,
		Email:       mpPlaceholderEmail(identity.Mobile),
		Mobile:      identity.Mobile,
		Password:    string(hash),
		Language:    "en",
		AccountType: models.AccountTypeBuyer,
		Onboarded:   true,
		WxOpenID:    identity.OpenID,
		WxUnionID:   identity.UnionID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := insertDoc(config.Collections.Members, member); err != nil {
		if isDuplicateErr(err) {
			return nil, ErrConflict("该手机号或该微信已注册，请重新进入小程序")
		}
		return nil, err
	}
	return member, nil
}

// bindWxIdentity 把微信身份写到指定会员上
func bindWxIdentity(memberID string, identity *WxIdentity) error {
	fields := map[string]interface{}{
		"wx_openid":  identity.OpenID,
		"updated_at": time.Now().UTC(),
	}
	if identity.UnionID != "" {
		fields["wx_unionid"] = identity.UnionID
	}
	if err := updateDoc(config.Collections.Members, memberID, config.M(fields)); err != nil {
		if isDuplicateErr(err) {
			return ErrConflict("该微信已绑定其他账号")
		}
		return err
	}
	return nil
}

// findMemberByWxOpenID 按微信身份查会员，未命中返回 nil
func findMemberByWxOpenID(openID string) (*models.Member, error) {
	if openID == "" {
		return nil, nil
	}
	var member models.Member
	filter := config.M(map[string]interface{}{"wx_openid": openID})
	if err := findOneDoc(config.Collections.Members, filter, &member); err != nil {
		return nil, err
	}
	if member.ID == "" {
		return nil, nil
	}
	return &member, nil
}

// issueMemberToken 签发商城会员令牌，与 POST /api/login 走同一个函数与同一个有效期
func issueMemberToken(member *models.Member) (*models.LoginResponse, error) {
	token, err := utils.GenerateMemberToken(member.ID, member.Username, config.JwtSecret, tokenExpire)
	if err != nil {
		return nil, err
	}
	return &models.LoginResponse{Token: token, TokenType: "Bearer"}, nil
}

// mpPlaceholderEmail email 上有唯一索引且 Member.Email 不落空，占位邮箱必须由手机号派生：
// 手机号本身唯一，占位邮箱因此也唯一
func mpPlaceholderEmail(mobile string) string {
	return "wx-" + mobile + "@mp.local"
}

// resolveWxIdentity 用微信平台凭证换身份：code 换 openid，另给了 phoneCode 就再解一次手机号
func resolveWxIdentity(ctx context.Context, code, phoneCode string) (*WxIdentity, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, ErrBadRequest("缺少微信登录凭证")
	}
	query := url.Values{
		"appid":      {mpWxAppID},
		"secret":     {mpWxAppSecret},
		"js_code":    {code},
		"grant_type": {"authorization_code"},
	}
	raw, err := mpWechatFetch(ctx, http.MethodGet, mpWxGateway+mpPathCode2Session+"?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		OpenID  string `json:"openid"`
		UnionID string `json:"unionid"`
		ErrCode int    `json:"errcode"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, errWxUnavailable()
	}
	if res.ErrCode != 0 || res.OpenID == "" {
		return nil, errWxRejected(res.ErrCode)
	}
	identity := &WxIdentity{OpenID: res.OpenID, UnionID: res.UnionID}

	phoneCode = strings.TrimSpace(phoneCode)
	if phoneCode == "" {
		return identity, nil
	}
	mobile, err := mpMobileByCode(ctx, phoneCode)
	if err != nil {
		return nil, err
	}
	// 号段校验放在这里而不是放在合并逻辑里：非大陆号码根本不该进 members，
	// 否则会在唯一索引上留下无法再用 H5 注册的记录
	if msg := ValidateMobile(mobile); msg != "" {
		return nil, ErrUnprocessable("授权手机号不是有效的中国大陆号码")
	}
	identity.Mobile = NormalizeMobile(mobile)
	return identity, nil
}

// mpMobileByCode 手机号快捷授权：拿 phoneCode 换平台解密后的号码，需要先取平台级 access_token
func mpMobileByCode(ctx context.Context, phoneCode string) (string, error) {
	token, err := mpAccessToken(ctx)
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(map[string]string{"code": phoneCode})
	if err != nil {
		return "", err
	}
	raw, err := mpWechatFetch(ctx, http.MethodPost,
		mpWxGateway+mpPathPhone+"?access_token="+url.QueryEscape(token), body)
	if err != nil {
		return "", err
	}
	var res struct {
		ErrCode   int `json:"errcode"`
		PhoneInfo struct {
			PurePhoneNumber string `json:"purePhoneNumber"`
			PhoneNumber     string `json:"phoneNumber"`
		} `json:"phone_info"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return "", errWxUnavailable()
	}
	if res.ErrCode != 0 {
		return "", errWxRejected(res.ErrCode)
	}
	// purePhoneNumber 不带国家码，是与库里口径一致的取法；只回了带码版本时靠归一化兜住
	if res.PhoneInfo.PurePhoneNumber != "" {
		return res.PhoneInfo.PurePhoneNumber, nil
	}
	if res.PhoneInfo.PhoneNumber != "" {
		return res.PhoneInfo.PhoneNumber, nil
	}
	return "", errWxRejected(res.ErrCode)
}

var (
	mpTokenMu  sync.Mutex
	mpToken    string
	mpTokenExp time.Time
)

// mpAccessToken 平台级 access_token 按调用次数计配额，缓存到临期前复用
func mpAccessToken(ctx context.Context) (string, error) {
	mpTokenMu.Lock()
	defer mpTokenMu.Unlock()
	if mpToken != "" && time.Now().Before(mpTokenExp) {
		return mpToken, nil
	}
	query := url.Values{
		"grant_type": {"client_credential"},
		"appid":      {mpWxAppID},
		"secret":     {mpWxAppSecret},
	}
	raw, err := mpWechatFetch(ctx, http.MethodGet, mpWxGateway+mpPathAccessToken+"?"+query.Encode(), nil)
	if err != nil {
		return "", err
	}
	var res struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return "", errWxUnavailable()
	}
	if res.ErrCode != 0 || res.AccessToken == "" {
		return "", errWxRejected(res.ErrCode)
	}
	mpToken = res.AccessToken
	// 提前 60 秒过期，避免拿临期令牌去换手机号
	if res.ExpiresIn > 120 {
		res.ExpiresIn -= 60
	}
	mpTokenExp = time.Now().Add(time.Duration(res.ExpiresIn) * time.Second)
	return mpToken, nil
}

// mpWechatFetch 微信接口出口，模拟与真实渠道的分岔只在这一行
// 失败一律回固定文案，不回传渠道原文，也刻意不打日志：请求 URL 里带着 appsecret
func mpWechatFetch(ctx context.Context, method, endpoint string, body []byte) ([]byte, error) {
	if mpWechatMock() {
		return mpMockResponse(endpoint, body)
	}
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, errWxUnavailable()
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := mpHTTPClient.Do(req)
	if err != nil {
		return nil, errWxUnavailable()
	}
	defer res.Body.Close()
	raw, err := ioutil.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, errWxUnavailable()
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, errWxUnavailable()
	}
	return raw, nil
}

// mpMockResponse 合成微信响应报文，之后的解码与 errcode 判断全走真实那段代码
// 身份只由 code 决定：同一段 code 每次进来得到同一个 openid，「同一人重复登录」与「不同人各自登录」都能离线复现
func mpMockResponse(endpoint string, reqBody []byte) ([]byte, error) {
	switch {
	case strings.Contains(endpoint, mpPathCode2Session):
		openID := "mock-openid-" + mpDigest(mpQueryValue(endpoint, "js_code"), 24)
		return json.Marshal(map[string]interface{}{
			"errcode":     0,
			"openid":      openID,
			"unionid":     "mock-unionid-" + mpDigest(openID, 24),
			"session_key": "MOCK-SESSION-KEY",
			"expires_in":  7200,
		})
	case strings.Contains(endpoint, mpPathAccessToken):
		return json.Marshal(map[string]interface{}{
			"errcode":      0,
			"access_token": "MOCK-ACCESS-TOKEN",
			"expires_in":   7200,
		})
	case strings.Contains(endpoint, mpPathPhone):
		var req map[string]string
		if err := json.Unmarshal(reqBody, &req); err != nil {
			return nil, errWxUnavailable()
		}
		return json.Marshal(map[string]interface{}{
			"errcode": 0,
			"phone_info": map[string]interface{}{
				"purePhoneNumber": mpMockMobile(req["code"]),
				"countryCode":     "86",
			},
		})
	}
	return nil, errWxUnavailable()
}

// mpMockMobile 模拟下允许直接把号码当授权码传进来，这样「H5 用手机号注册、小程序用同一手机号登录」
// 的合并路径能在没有平台资质的环境里验证；传的不是号码时按 code 派生一个稳定的大陆号段假号
func mpMockMobile(code string) string {
	if digits := NormalizeMobile(code); len(digits) == 11 {
		return digits
	}
	sum := sha256.Sum256([]byte("mp-mobile-" + code))
	digits := "13"
	for _, b := range sum[:9] {
		digits += string('0' + b%10)
	}
	return digits
}

// mpQueryValue 从已拼好的 URL 里取查询参数，模拟分支与真实请求读同一份参数
func mpQueryValue(endpoint, key string) string {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return ""
	}
	return parsed.Query().Get(key)
}

// mpDigest 取 sha256 的前 n 位十六进制，用于把平台凭证稳定映射成假身份
func mpDigest(s string, n int) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:n]
}

// errWxUnavailable 外呼失败
// 不带 endpoint 也不带渠道原文：URL 里有 appsecret，errmsg 里可能有 openid
func errWxUnavailable() error {
	return newErr(503, "微信身份服务暂不可用，请稍后重试")
}

// errWxRejected 渠道回了非零 errcode
// 40029 是 code 无效、40163 是 code 已用过，都属于客户端该重进一次小程序的情形
func errWxRejected(code int) error {
	if code == 40029 || code == 40163 {
		return ErrBadRequest("微信登录凭证无效或已使用，请重新进入小程序")
	}
	return newErr(502, "微信身份换取失败，请稍后重试")
}
