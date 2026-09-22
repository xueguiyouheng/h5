// services 业务逻辑层
// shop_store.go 门店域：商家建店/改店、买家附近门店与选店
// 距离用 haversine 直线距离在 Go 内算，门店量级小，不引入 2dsphere
package services

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// defaultDeliveryRadiusKM 门店未填配送半径时的兜底配送范围
const defaultDeliveryRadiusKM = 10

// nearbyScanLimit 附近门店一次扫描的门店上限，生鲜场景单城市门店数量有限
const nearbyScanLimit = 200

// earthRadiusMeters 地球平均半径，距离估算用
const earthRadiusMeters = 6371000.0

// StoreByID 按主键取门店，未命中返回 nil
func (s *ShopService) StoreByID(id string) (*models.Store, error) {
	if strings.TrimSpace(id) == "" {
		return nil, nil
	}
	var store models.Store
	if err := findOneDoc(config.Collections.Stores, config.M(map[string]interface{}{"_id": id}), &store); err != nil {
		return nil, err
	}
	if store.ID == "" {
		return nil, nil
	}
	return &store, nil
}

// OwnedStores 某账号名下的门店，商家注册时用于判重
func (s *ShopService) OwnedStores(memberID string) ([]models.Store, error) {
	var list []models.Store
	if err := findDocs(config.Collections.Stores, config.M(map[string]interface{}{"owner_member_id": memberID}), "created_at", false, nearbyScanLimit, 0, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Store{}
	}
	return list, nil
}

// FirstOwnedStore 商家账号自己的门店，运营中台的数据作用域就取它
func (s *ShopService) FirstOwnedStore(memberID string) (*models.Store, error) {
	list, err := s.OwnedStores(memberID)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

// CreateStore 建店，商家注册与存量数据迁移都走这里
// TODO(商家入驻): 后续加审核流程时，新店先置 pending 并在资质通过后才改 open
func (s *ShopService) CreateStore(memberID, name, address string, longitude, latitude float64) (*models.Store, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrBadRequest("请填写门店名称")
	}
	now := time.Now().UTC()
	store := &models.Store{
		ID:               newID(),
		Name:             name,
		Address:          strings.TrimSpace(address),
		Longitude:        longitude,
		Latitude:         latitude,
		DeliveryRadiusKM: defaultDeliveryRadiusKM,
		MinOrderAmount:   "0.00",
		Status:           models.StoreStatusOpen,
		OwnerMemberID:    memberID,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := insertDoc(config.Collections.Stores, store); err != nil {
		return nil, err
	}
	return store, nil
}

// UpdateStore 商家编辑自家门店资料，只改传了的字段
func (s *ShopService) UpdateStore(storeID string, req *models.StoreProfileRequest) (*models.Store, error) {
	store, err := s.StoreByID(storeID)
	if err != nil {
		return nil, err
	}
	if store == nil {
		return nil, ErrNotFound("门店不存在")
	}
	fields := map[string]interface{}{"updated_at": time.Now().UTC()}
	if name := strings.TrimSpace(req.Name); name != "" {
		fields["name"] = name
	}
	if req.LogoURL != "" {
		fields["logo_url"] = strings.TrimSpace(req.LogoURL)
	}
	if req.Description != "" {
		fields["description"] = strings.TrimSpace(req.Description)
	}
	if req.Phone != "" {
		fields["phone"] = strings.TrimSpace(req.Phone)
	}
	if req.Address != "" {
		fields["address"] = strings.TrimSpace(req.Address)
	}
	if req.Notice != "" {
		fields["notice"] = strings.TrimSpace(req.Notice)
	}
	if hasCoord(req.Longitude, req.Latitude) {
		fields["longitude"] = req.Longitude
		fields["latitude"] = req.Latitude
	}
	if req.DeliveryRadiusKM > 0 {
		fields["delivery_radius_km"] = req.DeliveryRadiusKM
	}
	if req.MinOrderAmount != "" {
		fields["min_order_amount"] = normalizePrice(req.MinOrderAmount)
	}
	if req.Status == models.StoreStatusOpen || req.Status == models.StoreStatusClosed {
		fields["status"] = req.Status
	}
	if err := updateDoc(config.Collections.Stores, storeID, config.M(fields)); err != nil {
		return nil, err
	}
	return s.StoreByID(storeID)
}

// NearbyStores 买家侧附近门店：按直线距离升序，未定位时按创建顺序返回
func (s *ShopService) NearbyStores(longitude, latitude float64, keyword, currentStoreID string) (*models.NearbyStoreList, error) {
	filter := keywordFilter(keyword, "name")
	var list []models.Store
	if err := findDocs(config.Collections.Stores, filter, "created_at", false, nearbyScanLimit, 0, &list); err != nil {
		return nil, err
	}
	located := hasCoord(longitude, latitude)
	items := make([]models.StoreItem, 0, len(list))
	for _, store := range list {
		item := models.StoreItem{Store: store, Current: store.ID == currentStoreID}
		if located {
			item.DistanceMeters = distanceMeters(longitude, latitude, store.Longitude, store.Latitude)
			item.DistanceText = formatDistance(item.DistanceMeters)
			item.OutOfRange = item.DistanceMeters > int64(radiusKM(&store)*1000)
		} else {
			item.DistanceText = "未定位"
		}
		items = append(items, item)
	}
	if located {
		sort.SliceStable(items, func(i, j int) bool { return items[i].DistanceMeters < items[j].DistanceMeters })
	}
	return &models.NearbyStoreList{List: items, Located: located}, nil
}

// SelectStore 买家选定门店并缓存定位，超配送范围仍可浏览但结算会被拦
func (s *ShopService) SelectStore(memberID, storeID string, longitude, latitude float64) (*models.StoreSelectionData, error) {
	store, err := s.StoreByID(storeID)
	if err != nil {
		return nil, err
	}
	if store == nil {
		return nil, ErrNotFound("门店不存在")
	}
	if store.Status == models.StoreStatusClosed {
		return nil, ErrUnprocessable("该门店已休息，换一家看看")
	}
	fields := map[string]interface{}{"default_store_id": store.ID, "updated_at": time.Now().UTC()}
	if hasCoord(longitude, latitude) {
		fields["longitude"] = longitude
		fields["latitude"] = latitude
	}
	if err := updateDoc(config.Collections.Members, memberID, config.M(fields)); err != nil {
		return nil, err
	}
	out := &models.StoreSelectionData{StoreID: store.ID, Name: store.Name}
	if hasCoord(longitude, latitude) {
		out.OutOfRange = distanceMeters(longitude, latitude, store.Longitude, store.Latitude) > int64(radiusKM(store)*1000)
	}
	return out, nil
}

// ResolveStore 取买家当前门店：选过的还营业就沿用，否则回落到最近的一家营业门店并写回
// 一家门店都没有时返回 nil，调用方按空数据展示
func (s *ShopService) ResolveStore(member *models.Member) (*models.Store, error) {
	store, err := s.StoreByID(member.DefaultStoreID)
	if err != nil {
		return nil, err
	}
	if store != nil && store.Status != models.StoreStatusClosed {
		return store, nil
	}
	nearby, err := s.NearbyStores(member.Longitude, member.Latitude, "", "")
	if err != nil {
		return nil, err
	}
	for _, item := range nearby.List {
		if item.Status == models.StoreStatusClosed {
			continue
		}
		picked := item.Store
		if picked.ID != member.DefaultStoreID {
			member.DefaultStoreID = picked.ID
			_ = updateDoc(config.Collections.Members, member.ID, config.M(map[string]interface{}{
				"default_store_id": picked.ID,
				"updated_at":       time.Now().UTC(),
			}))
		}
		return &picked, nil
	}
	// 全是休息中的门店时也让买家有店可看，避免首页整片空白
	if len(nearby.List) > 0 {
		picked := nearby.List[0].Store
		return &picked, nil
	}
	return store, nil
}

// homeStore 首页门店卡片，买家定位有效时带上距离与超范围标记
func homeStore(store *models.Store, member *models.Member) *models.HomeStore {
	view := &models.HomeStore{
		ID:             store.ID,
		Name:           store.Name,
		LogoURL:        store.LogoURL,
		Address:        store.Address,
		Phone:          store.Phone,
		Notice:         store.Notice,
		Status:         store.Status,
		MinOrderAmount: store.MinOrderAmount,
	}
	if hasCoord(member.Longitude, member.Latitude) {
		meters := distanceMeters(member.Longitude, member.Latitude, store.Longitude, store.Latitude)
		view.DistanceText = formatDistance(meters)
		view.OutOfRange = meters > int64(radiusKM(store)*1000)
	}
	return view
}

// hasCoord 经纬度是否有效，0/0 视为未定位，避免把赤道与本初子午线交点当成用户位置
func hasCoord(longitude, latitude float64) bool {
	return longitude != 0 || latitude != 0
}

// radiusKM 门店配送半径，未配置时给兜底值
func radiusKM(store *models.Store) float64 {
	if store.DeliveryRadiusKM > 0 {
		return float64(store.DeliveryRadiusKM)
	}
	return defaultDeliveryRadiusKM
}

// distanceMeters 两点间 haversine 直线距离，单位米
func distanceMeters(lngFrom, latFrom, lngTo, latTo float64) int64 {
	rad := func(v float64) float64 { return v * math.Pi / 180 }
	dLat := rad(latTo - latFrom)
	dLng := rad(lngTo - lngFrom)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rad(latFrom))*math.Cos(rad(latTo))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return int64(math.Round(2 * earthRadiusMeters * math.Asin(math.Sqrt(a))))
}

// formatDistance 距离文案，1 公里内用米
func formatDistance(meters int64) string {
	if meters < 1000 {
		return strconv.FormatInt(meters, 10) + "m"
	}
	return strconv.FormatFloat(float64(meters)/1000, 'f', 1, 64) + "km"
}
