// models 数据模型模块
// account.go 账户与内容域：会员、资料、设置、通知、帮助、客服会话、法务文案、引导页、上传
package models

import "time"

// Member 会员文档，注册账号存 Mongo；MySQL 的 users 表面向 SSO 演示后台
type Member struct {
	ID        string `bson:"_id,omitempty" json:"id"`
	Username  string `bson:"username" json:"username"`
	Email     string `bson:"email" json:"email"`
	Mobile    string `bson:"mobile" json:"mobile"`
	Password  string `bson:"password" json:"-"`
	Gender    string `bson:"gender,omitempty" json:"gender"`
	AvatarURL string `bson:"avatar_url,omitempty" json:"avatar_url"`
	Onboarded bool   `bson:"onboarded" json:"onboarded"`
	Language  string `bson:"language" json:"-"`
	// AccountType 注册时选的买家/商家，落在账号上；商家只是「买家 + 一家门店」，能力是叠加不是分流
	AccountType string `bson:"account_type,omitempty" json:"account_type"`
	// SSOUserID 关联 MySQL users 表的后台账号，首次访问商城时自动建档
	SSOUserID int `bson:"sso_user_id,omitempty" json:"-"`
	// WxOpenID / AlipayUserID 各渠道里的付款人身份，由小程序授权登录写入，只给支付用
	// 渠道拿它定位「钱从谁的账户扣」，所以只能存在服务端、也只能由服务端读出
	WxOpenID     string `bson:"wx_openid,omitempty" json:"-"`
	AlipayUserID string `bson:"alipay_user_id,omitempty" json:"-"`
	// WxUnionID 同一开放平台主体下该用户的稳定 ID，当前只入库留档，合并主键是平台授权的手机号
	WxUnionID string `bson:"wx_unionid,omitempty" json:"-"`
	// DefaultStoreID 买家当前选中的门店，商城列表/购物车/下单都按它取数
	DefaultStoreID string `bson:"default_store_id,omitempty" json:"default_store_id,omitempty"`
	// Longitude/Latitude 买家最近一次浏览器定位，用于「附近的门店」排序
	Longitude float64 `bson:"longitude,omitempty" json:"-"`
	Latitude  float64 `bson:"latitude,omitempty" json:"-"`
	// IsAdmin 仅在出参中出现：该账号拥有门店即可使用运营中台
	IsAdmin bool `bson:"-" json:"is_admin"`
	// OwnedStoreID / OwnedStoreName 商家账号自己的门店，中台顶栏与运营入口用
	OwnedStoreID   string    `bson:"-" json:"owned_store_id,omitempty"`
	OwnedStoreName string    `bson:"-" json:"owned_store_name,omitempty"`
	ResetCode      string    `bson:"reset_code,omitempty" json:"-"`
	ResetAt        time.Time `bson:"reset_at,omitempty" json:"-"`
	CreatedAt      time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt      time.Time `bson:"updated_at" json:"-"`
}

// RegisterRequest POST /api/register 入参
// account_type 为 merchant 时同步建一家门店，该账号既有买家能力也有运营中台入口
// store_address 是门店（发货地）地址，与买家账号下的收货地址是两回事
type RegisterRequest struct {
	Username     string  `json:"username" binding:"required"`
	Email        string  `json:"email" binding:"required"`
	Password     string  `json:"password" binding:"required"`
	Mobile       string  `json:"mobile" binding:"required"`
	AccountType  string  `json:"account_type"`
	StoreName    string  `json:"store_name"`
	StoreAddress string  `json:"store_address"`
	Longitude    float64 `json:"longitude"`
	Latitude     float64 `json:"latitude"`
}

// RegisterResult POST /api/register 出参
type RegisterResult struct {
	ID                   string `json:"id"`
	Email                string `json:"email"`
	VerificationRequired bool   `json:"verification_required"`
	// AccountType 回显注册时选的买家/商家
	AccountType string `json:"account_type"`
	// OwnedStoreID 商家注册成功后返回新店 ID，买家注册为空
	OwnedStoreID string `json:"owned_store_id,omitempty"`
}

// UpdateMemberRequest PUT /api/profile 入参，字段为空表示不修改
type UpdateMemberRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Mobile      string `json:"mobile"`
	Gender      string `json:"gender"`
	AvatarURL   string `json:"avatar_url"`
	Password    string `json:"password"`
	OldPassword string `json:"old_password"`
}

// Completeness GET /api/profile/completeness 出参
type Completeness struct {
	Done    int `json:"done"`
	Total   int `json:"total"`
	Percent int `json:"percent"`
}

// Rating 用户评分记录
type Rating struct {
	Value     int       `bson:"value" json:"value"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// MemberSettings 会员级设置文档，_id 即 member_id
type MemberSettings struct {
	ID       string   `bson:"_id" json:"-"`
	Language string   `bson:"language" json:"language"`
	Ratings  []Rating `bson:"ratings" json:"-"`
}

// SettingsData GET /api/settings 出参
type SettingsData struct {
	Language      string   `json:"language"`
	RatingAverage float64  `json:"rating_average"`
	RatingCount   int      `json:"rating_count"`
	Ratings       []Rating `json:"ratings"`
}

// RatingRequest POST /api/settings/ratings 入参
type RatingRequest struct {
	Value int `json:"value" binding:"required"`
}

// RatingResult POST /api/settings/ratings 出参
type RatingResult struct {
	RatingAverage float64 `json:"rating_average"`
	RatingCount   int     `json:"rating_count"`
}

// LegalDoc 条款/隐私文案文档，_id 即 key
type LegalDoc struct {
	ID        string    `bson:"_id" json:"key"`
	Title     string    `bson:"title" json:"title"`
	Body      string    `bson:"body" json:"body"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// Link 前端路由跳转（route 受白名单约束）
type Link struct {
	Label string `bson:"label" json:"label"`
	Route string `bson:"route" json:"route"`
}

// Notification 站内通知文档，read_by 记录已读会员
type Notification struct {
	ID          string    `bson:"_id,omitempty" json:"id"`
	Kind        string    `bson:"kind" json:"kind"`
	Title       string    `bson:"title" json:"title"`
	Description string    `bson:"description" json:"description"`
	Link        *Link     `bson:"link,omitempty" json:"link"`
	CreatedAt   time.Time `bson:"created_at" json:"created_at"`
	ReadBy      []string  `bson:"read_by" json:"-"`

	Read bool `bson:"-" json:"read"`
}

// ReadRequest POST /api/notifications/read 入参
type ReadRequest struct {
	IDs []string `json:"ids"`
}

// UnreadCount GET /api/notifications/unread-count 出参
type UnreadCount struct {
	Count int64 `json:"count"`
}

// FaqVote 单条 FAQ 的投票
type FaqVote struct {
	MemberID string `bson:"member_id" json:"-"`
	Helpful  bool   `bson:"helpful" json:"helpful"`
}

// Faq 帮助问题文档
type Faq struct {
	ID       string    `bson:"_id,omitempty" json:"id"`
	Question string    `bson:"question" json:"question"`
	Answer   string    `bson:"answer" json:"answer"`
	Link     *Link     `bson:"link,omitempty" json:"link"`
	Triggers []string  `bson:"triggers,omitempty" json:"-"`
	Sort     int       `bson:"sort" json:"-"`
	Votes    []FaqVote `bson:"votes" json:"-"`

	MyVote *bool `bson:"-" json:"my_vote"`
}

// FaqList GET /api/help/faqs 出参
type FaqList struct {
	List    []Faq   `json:"list"`
	Support Support `json:"support"`
}

// VoteRequest POST /api/help/faqs/{id}/vote 入参
type VoteRequest struct {
	Helpful *bool `json:"helpful" binding:"required"`
}

// VoteResult POST /api/help/faqs/{id}/vote 出参
type VoteResult struct {
	ResolvedCount int `json:"resolved_count"`
	Total         int `json:"total"`
}

// Support 客服联系方式
type Support struct {
	Hours string `json:"hours"`
	Phone string `json:"phone"`
	Email string `json:"email"`
}

// ChatMessage 客服会话消息文档
type ChatMessage struct {
	ID          string    `bson:"_id,omitempty" json:"id"`
	MemberID    string    `bson:"member_id" json:"-"`
	Role        string    `bson:"role" json:"role"`
	ContentType string    `bson:"content_type" json:"content_type"`
	Text        string    `bson:"text" json:"text"`
	MediaURL    string    `bson:"media_url,omitempty" json:"media_url"`
	MediaName   string    `bson:"media_name,omitempty" json:"media_name"`
	MediaSize   int64     `bson:"media_size,omitempty" json:"media_size"`
	Link        *Link     `bson:"link,omitempty" json:"link"`
	CreatedAt   time.Time `bson:"created_at" json:"created_at"`
}

// ChatList GET /api/chat/messages 出参
type ChatList struct {
	List       []ChatMessage `json:"list"`
	NextCursor string        `json:"next_cursor"`
}

// ChatRequest POST /api/chat/messages 入参
type ChatRequest struct {
	ContentType string `json:"content_type"`
	Text        string `json:"text"`
	MediaURL    string `json:"media_url"`
	// 图片消息随带原始文件名与字节数，前端气泡要展示「图片 · 名称 大小 KB」
	MediaName string `json:"media_name"`
	MediaSize int64  `json:"media_size"`
}

// ChatReplyResult POST /api/chat/messages 出参
type ChatReplyResult struct {
	Message ChatMessage  `json:"message"`
	Reply   *ChatMessage `json:"reply"`
	Typing  bool         `json:"typing"`
}

// SupportStatus GET /api/support/status 出参
type SupportStatus struct {
	Online        bool   `json:"online"`
	OpenLabel     string `json:"open_label"`
	NextOpenLabel string `json:"next_open_label"`
	Timezone      string `json:"timezone"`
}

// ResetPasswordRequest POST /api/auth/password/reset 入参
type ResetPasswordRequest struct {
	Email string `json:"email" binding:"required"`
}

// ResetPasswordResult POST /api/auth/password/reset 出参
type ResetPasswordResult struct {
	Sent    bool   `json:"sent"`
	Channel string `json:"channel"`
}

// ResetVerifyRequest POST /api/auth/password/reset-verify 入参
type ResetVerifyRequest struct {
	Code        string `json:"code" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// OnboardingSlide 引导页轮播文档
type OnboardingSlide struct {
	ID          string `bson:"_id,omitempty" json:"id"`
	Title       string `bson:"title" json:"title"`
	Description string `bson:"description" json:"description"`
	ImageURL    string `bson:"image_url" json:"image_url"`
	Sort        int    `bson:"sort" json:"-"`
}

// OnboardingStats 引导页展示的真实统计
type OnboardingStats struct {
	CategoryCount         int    `json:"category_count"`
	ProductCount          int    `json:"product_count"`
	VoucherCount          int    `json:"voucher_count"`
	LowestSpend           string `json:"lowest_spend"`
	FreeDeliveryThreshold string `json:"free_delivery_threshold"`
}

// OnboardingData GET /api/onboarding/slides 出参
type OnboardingData struct {
	List  []OnboardingSlide `json:"list"`
	Stats OnboardingStats   `json:"stats"`
}

// Upload 上传素材文档
type Upload struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	URL       string    `bson:"url" json:"url"`
	Name      string    `bson:"name" json:"name"`
	Size      int64     `bson:"size" json:"size"`
	Mime      string    `bson:"mime" json:"mime"`
	MemberID  string    `bson:"member_id" json:"-"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}
