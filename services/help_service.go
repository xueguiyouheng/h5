// services 业务逻辑层
// help_service.go 帮助中心与在线客服：FAQ、投票、会话消息、关键词自动回复与客服时段
package services

import (
	"regexp"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// HelpService 帮助与客服业务服务
type HelpService struct{}

// NewHelpService 创建帮助服务实例
func NewHelpService() *HelpService { return &HelpService{} }

// supportHoursOpen/supportHoursClose 客服在线时段（GMT+8）
const (
	supportHoursOpen  = 9 * 60
	supportHoursClose = 21 * 60
	supportUTCOffset  = 8
)

// SupportInfo 客服联系方式，运营文案的唯一来源
func SupportInfo() models.Support {
	return models.Support{
		Hours: "在线客服 09:00 - 21:00（GMT+8）",
		Phone: "+60 12-345 6789",
		Email: "support@freshmart.my",
	}
}

// greetings 打招呼关键词
var greetings = []string{"hi", "hello", "hey", "hiya", "你好", "您好", "在吗"}

// FAQs 帮助问题列表，带当前会员的投票结果
func (s *HelpService) FAQs(memberID string) (*models.FaqList, error) {
	var list []models.Faq
	if err := findDocs(config.Collections.FAQs, config.M(map[string]interface{}{}), "sort", false, 50, 0, &list); err != nil {
		return nil, err
	}
	support := SupportInfo()
	for i := range list {
		list[i].MyVote = memberVote(list[i].Votes, memberID)
		list[i].Link = sanitizeLink(list[i].Link)
	}
	if list == nil {
		list = []models.Faq{}
	}
	return &models.FaqList{List: list, Support: support}, nil
}

// memberVote 取当前会员对该问题的投票
func memberVote(votes []models.FaqVote, memberID string) *bool {
	for _, v := range votes {
		if v.MemberID == memberID {
			helpful := v.Helpful
			return &helpful
		}
	}
	return nil
}

// Vote 对 FAQ 是否有用投票，同一会员覆盖旧值
func (s *HelpService) Vote(memberID, faqID string, helpful bool) (*models.VoteResult, error) {
	var faq models.Faq
	if err := findOneDoc(config.Collections.FAQs, config.M(map[string]interface{}{"_id": faqID}), &faq); err != nil {
		return nil, err
	}
	if faq.ID == "" {
		return nil, ErrNotFound("问题不存在")
	}

	kept := make([]models.FaqVote, 0, len(faq.Votes)+1)
	for _, v := range faq.Votes {
		if v.MemberID != memberID {
			kept = append(kept, v)
		}
	}
	kept = append(kept, models.FaqVote{MemberID: memberID, Helpful: helpful})
	if err := updateDoc(config.Collections.FAQs, faqID, config.M(map[string]interface{}{"votes": kept})); err != nil {
		return nil, err
	}

	var all []models.Faq
	if err := findDocs(config.Collections.FAQs, config.M(map[string]interface{}{}), "sort", false, 50, 0, &all); err != nil {
		return nil, err
	}
	resolved := 0
	for _, item := range all {
		if v := memberVote(item.Votes, memberID); v != nil && *v {
			resolved++
		}
	}
	return &models.VoteResult{ResolvedCount: resolved, Total: len(all)}, nil
}

// History 会话历史，按 created_at 升序返回
func (s *HelpService) History(memberID, cursor string, limit int) (*models.ChatList, error) {
	limit = clampPageSize(limit, 30)
	filter := config.M(map[string]interface{}{"member_id": memberID})
	if cursor != "" {
		filter["created_at"] = map[string]interface{}{"$gt": parseTime(cursor)}
	}
	var list []models.ChatMessage
	if err := findDocs(config.Collections.ChatMessages, filter, "created_at", false, limit, 0, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.ChatMessage{}
	}
	next := ""
	if len(list) == limit {
		next = list[len(list)-1].CreatedAt.Format(time.RFC3339)
	}
	return &models.ChatList{List: list, NextCursor: next}, nil
}

// ClearHistory 清空会员会话记录
func (s *HelpService) ClearHistory(memberID string) error {
	return deleteDocs(config.Collections.ChatMessages, config.M(map[string]interface{}{"member_id": memberID}))
}

// Send 落库会员消息并生成自动回复
func (s *HelpService) Send(memberID string, req *models.ChatRequest) (*models.ChatReplyResult, error) {
	contentType := firstNonEmpty(req.ContentType, "text")
	if contentType != "text" && contentType != "image" {
		return nil, ErrBadRequest("消息类型不合法")
	}
	text := strings.TrimSpace(req.Text)
	media := strings.TrimSpace(req.MediaURL)
	if contentType == "text" && text == "" {
		return nil, ErrBadRequest("消息内容不能为空")
	}
	if contentType == "image" && media == "" {
		return nil, ErrBadRequest("缺少图片地址")
	}

	now := time.Now().UTC()
	message := models.ChatMessage{
		ID:          newID(),
		MemberID:    memberID,
		Role:        "user",
		ContentType: contentType,
		Text:        text,
		MediaURL:    media,
		MediaName:   strings.TrimSpace(req.MediaName),
		MediaSize:   req.MediaSize,
		CreatedAt:   now,
	}
	if err := insertDoc(config.Collections.ChatMessages, &message); err != nil {
		return nil, err
	}

	replyText := ""
	var link *models.Link
	if contentType == "image" {
		replyText = "图片收到了，我这边核对后回复你。"
	} else {
		replyText, link = s.botReply(text)
	}
	link = sanitizeLink(link)

	reply := models.ChatMessage{
		ID:          newID(),
		MemberID:    memberID,
		Role:        "agent",
		ContentType: "text",
		Text:        replyText,
		Link:        link,
		CreatedAt:   now.Add(time.Second),
	}
	if err := insertDoc(config.Collections.ChatMessages, &reply); err != nil {
		return nil, err
	}
	return &models.ChatReplyResult{Message: message, Reply: &reply, Typing: true}, nil
}

// botReply 关键词命中 FAQ，取最长关键词优先；未命中回落到人工引导
func (s *HelpService) botReply(text string) (string, *models.Link) {
	trimmed := strings.ToLower(strings.TrimSpace(text))
	head := regexp.MustCompile(`[\s,，!！?？.。]+`).Split(trimmed, 2)[0]
	for _, greet := range greetings {
		if head == strings.ToLower(greet) {
			return "Hello, What can I help you today?", nil
		}
	}

	var faqs []models.Faq
	if err := findDocs(config.Collections.FAQs, config.M(map[string]interface{}{}), "sort", false, 50, 0, &faqs); err != nil {
		faqs = nil
	}
	padded := " " + trimmed + " "
	var best *models.Faq
	bestLen := 0
	for i := range faqs {
		for _, key := range faqs[i].Triggers {
			k := strings.ToLower(strings.TrimSpace(key))
			if k == "" || !strings.Contains(padded, k) {
				continue
			}
			if len(k) > bestLen {
				best, bestLen = &faqs[i], len(k)
			}
		}
	}
	if best != nil {
		return best.Answer, best.Link
	}
	support := SupportInfo()
	return "可以把订单号或更具体的情况发给我。也可以在 09:00-21:00 致电 " + support.Phone + "，客服会实时跟进。",
		&models.Link{Label: "查看订单", Route: "/orders"}
}

// SupportStatus 客服是否在线，在线时段判定放在服务端保证多端一致
func (s *HelpService) SupportStatus(now time.Time) *models.SupportStatus {
	minutes := gmt8Minutes(now)
	online := minutes >= supportHoursOpen && minutes < supportHoursClose
	nextOpenLabel := "明天 09:00"
	if minutes < supportHoursOpen {
		nextOpenLabel = "今天 09:00"
	}
	return &models.SupportStatus{
		Online:        online,
		OpenLabel:     "09:00",
		NextOpenLabel: nextOpenLabel,
		Timezone:      "GMT+8",
	}
}

// gmt8Minutes 把任意时刻换算成 GMT+8 的当日分钟数
func gmt8Minutes(now time.Time) int {
	shifted := now.UTC().Add(time.Duration(supportUTCOffset) * time.Hour)
	return shifted.Hour()*60 + shifted.Minute()
}
