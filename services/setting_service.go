// services 业务逻辑层
// setting_service.go 会员设置、评分、法务文案与引导页内容
package services

import (
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// redeemStats 兑换码汇总
type redeemStats struct {
	count       int
	lowestSpend string
}

// SettingService 设置与内容服务
type SettingService struct{}

// NewSettingService 创建设置服务实例
func NewSettingService() *SettingService { return &SettingService{} }

// supportedLanguages 前端 LANGUAGES 支持的语言码
var supportedLanguages = map[string]bool{"en": true, "zh": true, "ms": true}

// ensure 取或建会员设置文档
func (s *SettingService) ensure(memberID string) (*models.MemberSettings, error) {
	var settings models.MemberSettings
	if err := findOneDoc(config.Collections.MemberSettings, config.M(map[string]interface{}{"_id": memberID}), &settings); err != nil {
		return nil, err
	}
	if settings.ID == "" {
		settings = models.MemberSettings{ID: memberID, Language: "en", Ratings: []models.Rating{}}
		if err := insertDoc(config.Collections.MemberSettings, &settings); err != nil {
			return nil, err
		}
	}
	if settings.Ratings == nil {
		settings.Ratings = []models.Rating{}
	}
	return &settings, nil
}

// Settings 读取语言与评分汇总
func (s *SettingService) Settings(memberID string) (*models.SettingsData, error) {
	settings, err := s.ensure(memberID)
	if err != nil {
		return nil, err
	}
	avg, count := ratingSummary(settings.Ratings)
	return &models.SettingsData{
		Language:      settings.Language,
		RatingAverage: avg,
		RatingCount:   count,
		Ratings:       settings.Ratings,
	}, nil
}

// SaveLanguage 更新界面语言
func (s *SettingService) SaveLanguage(memberID, language string) (*models.SettingsData, error) {
	language = strings.TrimSpace(language)
	if !supportedLanguages[language] {
		return nil, ErrBadRequest("不支持的语言")
	}
	settings, err := s.ensure(memberID)
	if err != nil {
		return nil, err
	}
	if err := updateDoc(config.Collections.MemberSettings, memberID, config.M(map[string]interface{}{"language": language})); err != nil {
		return nil, err
	}
	settings.Language = language
	return s.Settings(memberID)
}

// AddRating 提交评分，返回最新平均值
func (s *SettingService) AddRating(memberID string, value int) (*models.RatingResult, error) {
	if value < 1 || value > 5 {
		return nil, ErrBadRequest("评分需为 1-5")
	}
	settings, err := s.ensure(memberID)
	if err != nil {
		return nil, err
	}
	ratings := append(settings.Ratings, models.Rating{Value: value, CreatedAt: time.Now().UTC()})
	if err := updateDoc(config.Collections.MemberSettings, memberID, config.M(map[string]interface{}{"ratings": ratings})); err != nil {
		return nil, err
	}
	avg, count := ratingSummary(ratings)
	return &models.RatingResult{RatingAverage: avg, RatingCount: count}, nil
}

// ratingSummary 平均星级保留一位小数
func ratingSummary(ratings []models.Rating) (float64, int) {
	if len(ratings) == 0 {
		return 0, 0
	}
	total := 0
	for _, r := range ratings {
		total += r.Value
	}
	return float64(int(float64(total)/float64(len(ratings))*10+0.5)) / 10, len(ratings)
}

// Legal 条款/隐私文案
func (s *SettingService) Legal(key string) (*models.LegalDoc, error) {
	switch key {
	case "terms", "privacy":
	default:
		return nil, ErrNotFound("文档不存在")
	}
	var doc models.LegalDoc
	if err := findOneDoc(config.Collections.LegalDocs, config.M(map[string]interface{}{"_id": key}), &doc); err != nil {
		return nil, err
	}
	if doc.ID == "" {
		return nil, ErrNotFound("文档不存在")
	}
	return &doc, nil
}

// Onboarding 引导页内容，统计口径来自真实库
func (s *SettingService) Onboarding() (*models.OnboardingData, error) {
	var slides []models.OnboardingSlide
	if err := findDocs(config.Collections.Onboarding, config.M(map[string]interface{}{}), "sort", false, 10, 0, &slides); err != nil {
		return nil, err
	}
	categories, err := countDocs(config.Collections.Categories, config.M(map[string]interface{}{"status": "on"}))
	if err != nil {
		return nil, err
	}
	products, err := countDocs(config.Collections.Products, config.M(map[string]interface{}{"status": "on"}))
	if err != nil {
		return nil, err
	}
	codes, err := s.redeemCodeStats()
	if err != nil {
		return nil, err
	}
	if slides == nil {
		slides = []models.OnboardingSlide{}
	}
	return &models.OnboardingData{
		List: slides,
		Stats: models.OnboardingStats{
			CategoryCount:         int(categories),
			ProductCount:          int(products),
			VoucherCount:          codes.count,
			LowestSpend:           codes.lowestSpend,
			FreeDeliveryThreshold: money(freeDeliveryThreshold),
		},
	}, nil
}

// redeemCodeStats 兑换码数量与最低消费门槛
func (s *SettingService) redeemCodeStats() (*redeemStats, error) {
	var list []models.RedeemCode
	if err := findDocs(config.Collections.RedeemCodes, config.M(map[string]interface{}{}), "_id", false, 50, 0, &list); err != nil {
		return nil, err
	}
	out := &redeemStats{count: len(list), lowestSpend: money(freeDeliveryThreshold)}
	lowest := -1.0
	for _, code := range list {
		v := priceValue(code.MinSpend)
		if lowest < 0 || v < lowest {
			lowest = v
		}
	}
	if lowest >= 0 {
		out.lowestSpend = money(lowest)
	}
	return out, nil
}
