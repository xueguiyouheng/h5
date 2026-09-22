// seed 商城演示数据初始化
// 把设计稿里的类目、商品、订单、券、通知、FAQ、法务文案与引导页写入 MongoDB freshmart
// 商品图片从前端资源目录复制到 uploads/seed，库里只保存 /uploads/... 地址
package seed

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// 演示账号：admin 是旗舰店的商家账号（同时关联 MySQL 的 SSO 后台），ada 用于验证会员注册登录，
// bob 是第二家门店的商家账号，用来验证商家之间看不到彼此的数据
const (
	demoAdminID     = "member-admin"
	demoMemberID    = "member-ada"
	demoMemberMail  = "adamsmith@email.com"
	demoMemberPass  = "Adam@2024"
	demoMerchant2ID = "member-bob"
	demoStoreID     = "store-1"
	demoStoreName   = "FreshMart 旗舰店"
	secondStoreID   = "store-2"
)

// demoAddressDetail 两位买家的默认收货地址，订单快照与地址簿共用同一条文案
const demoAddressDetail = "3 Addersion Court, Chino Hills, HO56824, United State"

// demoLng/demoLat 演示买家坐标（吉隆坡市中心），保证两家门店都落在配送范围内
const (
	demoBuyerLng = 101.6953
	demoBuyerLat = 3.1478
)

// assetSource 前端资源目录，图片从这里复制到 uploads
var assetSource = filepath.Join("frontend", "src", "assets")

// uploadDir 上传目录，与 services.UploadRoot 保持一致
var uploadDir = filepath.Join(".", "uploads")

// Run 重建演示数据
func Run() error {
	if err := config.InitMongoForSeed(); err != nil {
		return err
	}
	defer config.CloseMongo()

	if err := dropAll(); err != nil {
		return err
	}

	urls, err := copyImages()
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	if err := seedStores(urls, now); err != nil {
		return err
	}
	if err := seedMembers(now); err != nil {
		return err
	}
	productsByStore, err := seedCatalog(urls)
	if err != nil {
		return err
	}
	primary := productsByStore[demoStoreID]
	if err := seedCart(primary, productsByStore[secondStoreID]); err != nil {
		return err
	}
	if err := seedVouchers(); err != nil {
		return err
	}
	if err := seedAddresses(now); err != nil {
		return err
	}
	if err := seedOrders(primary, now); err != nil {
		return err
	}
	if err := seedNotifications(now); err != nil {
		return err
	}
	if err := seedFAQs(); err != nil {
		return err
	}
	if err := seedLegal(now); err != nil {
		return err
	}
	if err := seedOnboarding(urls); err != nil {
		return err
	}

	fmt.Println("演示数据写入完成，库:", config.MongoDBName)
	fmt.Println("商家账号(有运营入口):", demoAdminID, "拥有", demoStoreName)
	fmt.Println("买家账号:", demoMemberMail, "/", demoMemberPass)
	return nil
}

// dropAll 清空业务集合，保证种子结果可重复
func dropAll() error {
	names := []string{
		config.Collections.Stores,
		config.Collections.Members, config.Collections.Categories, config.Collections.Subcategories,
		config.Collections.Products, config.Collections.Carousels, config.Collections.Carts,
		config.Collections.Vouchers, config.Collections.RedeemCodes, config.Collections.Addresses,
		config.Collections.Orders, config.Collections.Notifications, config.Collections.FAQs,
		config.Collections.ChatMessages, config.Collections.MemberSettings, config.Collections.LegalDocs,
		config.Collections.Uploads, config.Collections.Onboarding,
	}
	for _, name := range names {
		if err := config.Col(name).Drop(context.Background()); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 素材复制 ----------

// copyImages 把用到的前端图片复制到 uploads/seed，返回 名称 → 访问地址
func copyImages() (map[string]string, error) {
	src := []string{
		"search/cat-vegetables.png", "search/cat-meat.png", "search/cat-dairy.png",
		"search/cat-beverages.png", "search/cat-bakeries.png", "search/cat-snacks.png",
		"search/cat-pepper.png", "search/cat-spices.png",
		"shop/broccoli.png", "shop/tomato.png", "shop/garlic.png", "shop/lemon.png",
		"shop/avocado.png", "shop/strawberry.png", "shop/banner-food.png",
		"category/cabbage.png", "category/corn.png", "category/carrot.png",
		"category/cucumber.png", "category/tomato.png",
		"search/apple.png", "search/orange.png", "search/mango.png",
		"detail/broccoli-hero.png", "detail/carrot.png", "detail/cucumber.png",
	}
	urls := map[string]string{}
	dst := filepath.Join(uploadDir, "seed")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return nil, err
	}
	for _, rel := range src {
		base := strings.TrimSuffix(filepath.Base(rel), ".png")
		// 不同目录存在同名素材（tomato / carrot / cucumber），冲突时用目录前缀命名，避免互相覆盖
		file := base + ".png"
		if _, dup := urls[base]; dup {
			file = strings.Replace(rel, "/", "-", -1)
		}
		key := strings.TrimSuffix(file, ".png")
		in, err := os.Open(filepath.Join(assetSource, filepath.FromSlash(rel)))
		if err != nil {
			return nil, fmt.Errorf("缺少素材 %s: %w", rel, err)
		}
		outPath := filepath.Join(dst, file)
		out, err := os.Create(outPath)
		if err != nil {
			in.Close()
			return nil, err
		}
		if _, err := io.Copy(out, in); err != nil {
			in.Close()
			out.Close()
			return nil, err
		}
		in.Close()
		out.Close()
		url := "/uploads/seed/" + file
		urls[key] = url
		if _, ok := urls[base]; !ok {
			urls[base] = url
		}
		if err := insertDoc(config.Collections.Uploads, &models.Upload{
			ID: newObjectID(), URL: url, Name: file,
			Size: fileSize(outPath), Mime: "image/png",
			MemberID: demoAdminID, CreatedAt: time.Now().UTC(),
		}); err != nil {
			return nil, err
		}
	}
	return urls, nil
}

// fileSize 取文件字节数，失败返回 0
func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// ---------- 门店 ----------

// storeSeed 一家演示门店
// cat_limit / prod_limit 决定这家店铺多少货：第二家店只铺少量商品，用来验证买家切店后看到的目录完全不同
type storeSeed struct {
	id        string
	name      string
	owner     string
	logo      string
	address   string
	lng       float64
	lat       float64
	radius    int
	notice    string
	prefix    string
	catLimit  int
	prodLimit int
}

var storeSeeds = []storeSeed{
	{
		id: demoStoreID, name: demoStoreName, owner: demoAdminID, logo: "cat-vegetables",
		address: "Menara FreshMart, Jalan Ampang, 50450 Kuala Lumpur",
		lng:     101.6869, lat: 3.1390, radius: 12,
		notice: "自营冷链，下单后 90 分钟送达", prefix: "", catLimit: 12, prodLimit: 13,
	},
	{
		id: secondStoreID, name: "FreshMart Mid Valley", owner: demoMerchant2ID, logo: "cat-meat",
		address: "Unit L2-12, Mid Valley Megamall, 59100 Kuala Lumpur",
		lng:     101.6775, lat: 3.1175, radius: 8,
		notice: "商场店，营业至 22:00", prefix: secondStoreID + "-", catLimit: 3, prodLimit: 6,
	},
}

// seedStores 写入门店，第二家的 ID 由前缀推导
func seedStores(urls map[string]string, now time.Time) error {
	for _, s := range storeSeeds {
		store := models.Store{
			ID: s.id, Name: s.name, LogoURL: urls[s.logo], Address: s.address,
			Longitude: s.lng, Latitude: s.lat, DeliveryRadiusKM: s.radius,
			MinOrderAmount: "20.00", Notice: s.notice, Status: models.StoreStatusOpen,
			OwnerMemberID: s.owner, CreatedAt: now, UpdatedAt: now,
		}
		if err := insertDoc(config.Collections.Stores, &store); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 会员 ----------

// seedMembers 建演示会员：旗舰店商家档案、第二家门店商家档案、注册的商城买家
func seedMembers(now time.Time) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(demoMemberPass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	unreachable, err := bcrypt.GenerateFromPassword([]byte(newObjectID()), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	members := []models.Member{
		{
			ID: demoAdminID, Username: "admin", Email: "admin@sso.local", Mobile: "60123450001",
			Password: string(unreachable), Gender: "male", Onboarded: true, Language: "en",
			AccountType: models.AccountTypeMerchant,
			SSOUserID:   1, DefaultStoreID: demoStoreID, Longitude: demoBuyerLng, Latitude: demoBuyerLat,
			CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: demoMerchant2ID, Username: "Bob Wang", Email: "bob.wang@email.com", Mobile: "60123450002",
			Password: string(hash), Gender: "male", Onboarded: true, Language: "en",
			AccountType: models.AccountTypeMerchant, DefaultStoreID: secondStoreID, CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: demoMemberID, Username: "Adam Smith", Email: demoMemberMail, Mobile: "60122578692",
			Password: string(hash), Gender: "male", Onboarded: true, Language: "en",
			AccountType:    models.AccountTypeBuyer,
			DefaultStoreID: demoStoreID, Longitude: demoBuyerLng, Latitude: demoBuyerLat,
			CreatedAt: now, UpdatedAt: now,
		},
	}
	for i := range members {
		if err := insertDoc(config.Collections.Members, &members[i]); err != nil {
			return err
		}
		if err := insertDoc(config.Collections.MemberSettings, &models.MemberSettings{
			ID: members[i].ID, Language: "en",
			Ratings: []models.Rating{{Value: 5, CreatedAt: now}, {Value: 4, CreatedAt: now}},
		}); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 类目 ----------

type categorySeed struct {
	id    string
	name  string
	image string
	subs  []string
}

var categorySeeds = []categorySeed{
	{"cat-1", "Fresh Vegetables & Fruits", "cat-vegetables", []string{"Leaf Vegetables", "Root Vegetables", "Cruciferous", "Salad Greens", "Seasonal Fruits"}},
	{"cat-2", "Meat & Fish", "cat-meat", []string{"Beef", "Poultry", "Fresh Fish", "Shellfish"}},
	{"cat-3", "Dairy", "cat-dairy", []string{"Milk", "Cheese", "Butter", "Eggs"}},
	{"cat-4", "Beverages", "cat-beverages", []string{"Juice", "Sparkling", "Tea"}},
	{"cat-5", "Bakeries", "cat-bakeries", []string{"Bread", "Pastry", "Cake"}},
	{"cat-6", "Snacks", "cat-snacks", []string{"Chips", "Nuts", "Dried Fruits"}},
	{"cat-7", "Spices", "cat-pepper", []string{"Ground Spices", "Whole Spices", "Herbs"}},
	{"cat-8", "Seasoning", "cat-spices", []string{"Sauce", "Paste", "Oil"}},
	{"cat-9", "Frozen Food", "cat-meat", []string{"Frozen Veg", "Frozen Meal"}},
	{"cat-10", "Organic Salad", "cat-vegetables", []string{"Mix", "Greens"}},
	{"cat-11", "Coffee & Tea", "cat-beverages", []string{"Coffee", "Loose Tea"}},
	{"cat-12", "Fresh Bread", "cat-bakeries", []string{"Sourdough", "Flatbread"}},
}

// seedCatalog 按门店写入类目、商品与轮播，返回 门店 ID → 该店商品
func seedCatalog(urls map[string]string) (map[string][]models.Product, error) {
	byStore := map[string][]models.Product{}
	for _, store := range storeSeeds {
		cats, subs, err := seedCategories(store, urls)
		if err != nil {
			return nil, err
		}
		products, err := seedProducts(store, cats, subs, urls)
		if err != nil {
			return nil, err
		}
		if err := seedCarousel(store, urls); err != nil {
			return nil, err
		}
		byStore[store.id] = products
	}
	return byStore, nil
}

// seedCategories 写入本店类目与子类目，类目名只在门店内唯一
func seedCategories(store storeSeed, urls map[string]string) ([]models.Category, []models.Subcategory, error) {
	var cats []models.Category
	var subs []models.Subcategory
	seeds := categorySeeds
	if store.catLimit > 0 && store.catLimit < len(seeds) {
		seeds = seeds[:store.catLimit]
	}
	for i, seed := range seeds {
		cat := models.Category{
			ID: store.prefix + seed.id, StoreID: store.id, Name: seed.name, ImageURL: urls[seed.image],
			Sort: i + 1, Status: "on", CreatedAt: time.Now().UTC(),
		}
		if err := insertDoc(config.Collections.Categories, &cat); err != nil {
			return nil, nil, err
		}
		cats = append(cats, cat)
		for j, name := range seed.subs {
			sub := models.Subcategory{ID: cat.ID + "-s" + itoa(j+1), CategoryID: cat.ID, Name: name, Sort: j + 1}
			if err := insertDoc(config.Collections.Subcategories, &sub); err != nil {
				return nil, nil, err
			}
			subs = append(subs, sub)
		}
	}
	return cats, subs, nil
}

// ---------- 商品 ----------

// productTemplate 商品名 / 单价 / 单位 / 图片 / 描述
type productTemplate struct {
	name  string
	price string
	unit  string
	image string
	desc  string
	kcal  int
}

var productPool = []productTemplate{
	{"Broccoli", "4.99", "per kg", "broccoli", "Choose broccoli heads with tight, dark-green florets and firm stalks. Steam lightly to keep the colour.", 34},
	{"Tomato", "3.49", "per kg", "tomato", "Vine-ripened tomatoes with balanced sweetness. Store at room temperature away from direct sun.", 18},
	{"Garlic", "2.20", "per 500g", "garlic", "Plump bulbs with a mellow bite. Keep in a dry, ventilated place.", 149},
	{"Lemon", "1.80", "per 500g", "lemon", "Thin-skinned lemons, heavy for their size. Juice keeps two days chilled.", 29},
	{"Avocado", "5.99", "per piece", "avocado", "Ready-to-eat avocados that yield gently to pressure. Ripen unripe fruit in a paper bag.", 160},
	{"Strawberry", "6.50", "per box", "strawberry", "Hand-picked berries in a single layer. Rinse just before serving.", 32},
	{"Cabbage", "2.60", "per kg", "cabbage", "Dense heads with crisp leaves. Shreds finely for slaw.", 25},
	{"Sweet Corn", "3.20", "per 3 cobs", "corn", "Milky kernels picked at dawn. Boil four minutes from the fold.", 86},
	{"Carrot", "2.10", "per kg", "carrot", "Snappy carrots, sweet when roasted low and slow.", 41},
	{"Cucumber", "1.95", "per kg", "cucumber", "Seedless varieties with a cool, watery crunch.", 15},
	{"Apple", "4.30", "per kg", "apple", "Crisp dessert apples with a glossy skin.", 52},
	{"Orange", "3.85", "per kg", "orange", "Navel oranges with loose peel and high juice.", 47},
	{"Mango", "7.20", "per kg", "mango", "Fragrant honey mangoes, sweet at the shoulder.", 60},
}

// seedProducts 为本店每个类目铺商品，前 12 件进 Exclusive Offer，其后 12 件进 Best Selling，全部进推荐流
func seedProducts(store storeSeed, cats []models.Category, subs []models.Subcategory, urls map[string]string) ([]models.Product, error) {
	var all []models.Product
	serial := 0
	pool := productPool
	if store.prodLimit > 0 && store.prodLimit < len(pool) {
		pool = pool[:store.prodLimit]
	}
	for _, cat := range cats {
		catSubs := subsOf(subs, cat.ID)
		for i, tpl := range pool {
			serial++
			sections := []string{"recommend"}
			switch {
			case serial <= 12:
				sections = []string{"exclusive_offer", "recommend"}
			case serial <= 24:
				sections = []string{"best_selling", "recommend"}
			}
			subcategoryID, subcategoryName := "", ""
			if len(catSubs) > 0 {
				sub := catSubs[i%len(catSubs)]
				subcategoryID, subcategoryName = sub.ID, sub.Name
			}
			image := urls[tpl.image]
			if image == "" {
				image = urls["broccoli"]
			}
			product := models.Product{
				ID:              cat.ID + "-p" + itoa(i+1),
				StoreID:         store.id,
				Name:            tpl.name,
				Price:           tpl.price,
				Currency:        "USD",
				Unit:            tpl.unit,
				OldPrice:        oldPrice(tpl.price),
				Badge:           discountBadge(serial),
				ImageURL:        image,
				Images:          []string{image, urls["broccoli-hero"]},
				Description:     tpl.desc,
				Nutrition:       models.Nutrition{Calories: tpl.kcal, Per: "100g"},
				Stock:           12 + (serial % 30),
				Sales:           (serial * 37) % 400,
				CategoryID:      cat.ID,
				SubcategoryID:   subcategoryID,
				SubcategoryName: subcategoryName,
				Sections:        sections,
				Sort:            i + 1,
				Status:          "on",
				CreatedAt:       time.Now().UTC(),
				UpdatedAt:       time.Now().UTC(),
			}
			if err := insertDoc(config.Collections.Products, &product); err != nil {
				return nil, err
			}
			all = append(all, product)
		}
	}
	return all, nil
}

// subsOf 过滤出某类目下的子类目
func subsOf(subs []models.Subcategory, categoryID string) []models.Subcategory {
	out := make([]models.Subcategory, 0, 4)
	for _, sub := range subs {
		if sub.CategoryID == categoryID {
			out = append(out, sub)
		}
	}
	return out
}

// oldPrice 原价按售价上浮两成，制造划线价
func oldPrice(price string) string {
	f := priceFloat(price)
	if f <= 0 {
		return ""
	}
	return fmt.Sprintf("%.2f", f*1.2)
}

// priceFloat 解析金额字符串
func priceFloat(s string) float64 {
	var f float64
	if _, err := fmt.Sscanf(s, "%f", &f); err != nil {
		return 0
	}
	return f
}

// discountBadge 每五件商品给一次角标
func discountBadge(serial int) string {
	if serial%5 == 0 {
		return "-20%"
	}
	if serial%7 == 0 {
		return "New"
	}
	return ""
}

// ---------- 轮播 ----------

// seedCarousel 本店首页轮播位
func seedCarousel(store storeSeed, urls map[string]string) error {
	items := []models.Carousel{
		{ID: store.id + "-cb-1", StoreID: store.id, Title: "Fresh week, half price boxes", ImageURL: urls["banner-food"], Link: "/shop", Sort: 3, Status: "on", UpdatedAt: time.Now().UTC()},
		{ID: store.id + "-cb-2", StoreID: store.id, Title: "Farm direct delivery in 90 min", ImageURL: urls[store.logo], Link: "/shop", Sort: 2, Status: "on", UpdatedAt: time.Now().UTC()},
		{ID: store.id + "-cb-3", StoreID: store.id, Title: "Members earn double points", ImageURL: urls["cat-dairy"], Link: "/vouchers", Sort: 1, Status: "off", UpdatedAt: time.Now().UTC()},
	}
	for i := range items {
		if err := insertDoc(config.Collections.Carousels, &items[i]); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 购物车 ----------

// seedCart 两位买家在默认门店各放三件商品；ada 另留一行第二门店的货，用来验证切店不丢车
func seedCart(primary, second []models.Product) error {
	if len(primary) < 3 {
		return fmt.Errorf("商品数据不足，无法生成购物车")
	}
	lines := []models.CartLine{
		{ProductID: primary[0].ID, StoreID: primary[0].StoreID, Qty: 2, Selected: true},
		{ProductID: primary[1].ID, StoreID: primary[1].StoreID, Qty: 1, Selected: true},
		{ProductID: primary[2].ID, StoreID: primary[2].StoreID, Qty: 3, Selected: false},
	}
	for _, memberID := range []string{demoAdminID, demoMemberID} {
		cart := models.Cart{
			ID: "cart-" + memberID, MemberID: memberID,
			Lines: append([]models.CartLine{}, lines...), UpdatedAt: time.Now().UTC(),
		}
		if memberID == demoMemberID && len(second) > 0 {
			cart.Lines = append(cart.Lines, models.CartLine{
				ProductID: second[0].ID, StoreID: second[0].StoreID, Qty: 1, Selected: true,
			})
		}
		if err := insertDoc(config.Collections.Carts, &cart); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 优惠券 ----------

// seedVouchers 兑换码模板与会员券包
func seedVouchers() error {
	codes := []models.RedeemCode{
		{Code: "FRESH50", Kind: "percent", Value: 30, MinSpend: "50.00", Description: "Discount 30% off if you purchase $50 or above", ValidityDays: 210},
		{Code: "SAVE5", Kind: "fixed", Value: 5, MinSpend: "25.00", Description: "Save $5 on orders over $25", ValidityDays: 60},
		{Code: "FREESHIP", Kind: "shipping", Value: 0, MinSpend: "20.00", Description: "Free delivery on orders over $20", ValidityDays: 30},
	}
	for i := range codes {
		if err := insertDoc(config.Collections.RedeemCodes, &codes[i]); err != nil {
			return err
		}
	}

	expire := time.Now().UTC().AddDate(1, 0, 0).Format("2006-01-02")
	for _, memberID := range []string{demoAdminID, demoMemberID} {
		vouchers := []models.Voucher{
			{ID: memberID + "-vc-1", MemberID: memberID, Title: "30%", Kind: "percent", Value: 30, MinSpend: "50.00", Description: "Discount 30% off if you purchase $50 or above", ExpiredAt: expire, Source: "campaign", CreatedAt: time.Now().UTC()},
			{ID: memberID + "-vc-2", MemberID: memberID, Title: "Free Shipping", Kind: "shipping", Value: 0, MinSpend: "20.00", Description: "Free delivery on your next grocery run", ExpiredAt: expire, Source: "campaign", CreatedAt: time.Now().UTC()},
			{ID: memberID + "-vc-3", MemberID: memberID, Title: "$5", Kind: "fixed", Value: 5, MinSpend: "25.00", Description: "Save $5 on orders over $25", ExpiredAt: expire, Source: "redeem_code", RedeemCode: "SAVE5", CreatedAt: time.Now().UTC()},
		}
		for i := range vouchers {
			if err := insertDoc(config.Collections.Vouchers, &vouchers[i]); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------- 地址 ----------

// seedAddresses 两位演示会员各两条地址，第一条为默认
func seedAddresses(now time.Time) error {
	for _, memberID := range []string{demoAdminID, demoMemberID} {
		list := []models.Address{
			{ID: memberID + "-ad-1", MemberID: memberID, Label: "My Home", Detail: demoAddressDetail, IsDefault: true, UpdatedAt: now},
			{ID: memberID + "-ad-2", MemberID: memberID, Label: "Office", Detail: "Menara FreshMart, Jalan Ampang, 50450 Kuala Lumpur", IsDefault: false, UpdatedAt: now},
		}
		for i := range list {
			if err := insertDoc(config.Collections.Addresses, &list[i]); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------- 订单 ----------

// seedOrders 每位买家 14 单：8 单进行中、6 单历史，金额由行项目真实累加
// 全部落在旗舰店，配合 PaymentStatus 让运营中台的订单处理模块有已付款单可操作
func seedOrders(products []models.Product, now time.Time) error {
	buyers := []struct{ id, name, mobile string }{
		{demoAdminID, "Admin", "60123450001"},
		{demoMemberID, "Adam Smith", "60122578692"},
	}
	statuses := []string{"accepted", "ready", "accepted", "ready", "delivered", "cancelled", "ready", "accepted", "delivered", "delivered", "cancelled", "ready", "accepted", "delivered"}
	serial := 0
	for _, buyer := range buyers {
		memberID := buyer.id
		for i, status := range statuses {
			serial++
			items := make([]models.OrderItem, 0, 3)
			var subtotal float64
			lineCount := (i % 3) + 1
			for j := 0; j < lineCount && j*3+i < len(products); j++ {
				product := products[(i*3+j)%len(products)]
				qty := (i+j)%3 + 1
				line := priceFloat(product.Price) * float64(qty)
				subtotal += line
				items = append(items, models.OrderItem{
					ProductID: product.ID, Name: product.Name, ImageURL: product.ImageURL,
					UnitPrice: product.Price, Qty: qty, LineTotal: fmt.Sprintf("%.2f", line),
				})
			}
			// 首单落在今天，中台「今日新单 / 今日收款」才有数据
			created := now.Add(-time.Duration(serial) * 7 * time.Hour)
			tab := "ongoing"
			if status == "delivered" || status == "cancelled" {
				tab = "history"
			}
			delivery := "5.00"
			if subtotal >= 20 {
				delivery = "0.00"
			}
			total := subtotal + priceFloat(delivery)
			paid := status != "cancelled"
			paymentStatus := "unpaid"
			paidAt := ""
			if paid {
				paymentStatus = "paid"
				paidAt = created.Add(3 * time.Minute).Format(time.RFC3339)
			}
			order := models.Order{
				ID:            fmt.Sprintf("%s-ord-%02d", memberID, i+1),
				OrderNo:       fmt.Sprintf("FM%s%03d", created.Format("20060102"), serial),
				MemberID:      memberID,
				StoreID:       demoStoreID,
				StoreName:     demoStoreName,
				AddressID:     memberID + "-ad-1",
				AddressLabel:  "My Home",
				AddressDetail: demoAddressDetail,
				Receiver:      buyer.name,
				ReceiverPhone: buyer.mobile,
				Status:        status,
				Tab:           tab,
				Items:         items,
				Currency:      "USD",
				Subtotal:      fmt.Sprintf("%.2f", subtotal),
				Discount:      "0.00",
				DeliveryFee:   delivery,
				Total:         fmt.Sprintf("%.2f", total),
				PaymentMethod: "alipay",
				PaymentStatus: paymentStatus,
				PaidAt:        paidAt,
				ETA:           created.Add(90 * time.Minute).Format(time.RFC3339),
				Steps:         stepsFor(status, created),
				CreatedAt:     created,
			}
			if err := insertDoc(config.Collections.Orders, &order); err != nil {
				return err
			}
		}
	}
	return nil
}

// stepsFor 依状态生成轨迹节点
func stepsFor(status string, created time.Time) []models.OrderStep {
	codes := []struct{ code, label string }{
		{"accepted", "Order accepted"},
		{"preparing", "Packing at store"},
		{"ready", "Ready to collect"},
		{"delivered", "Order delivered"},
	}
	rank := map[string]int{"accepted": 1, "ready": 3, "delivered": 4, "cancelled": 1}[status]
	steps := make([]models.OrderStep, 0, 5)
	for i, c := range codes {
		at := ""
		if i < rank {
			at = created.Add(time.Duration(i*15) * time.Minute).Format(time.RFC3339)
		}
		steps = append(steps, models.OrderStep{Code: c.code, Label: c.label, At: at, Done: i < rank})
	}
	if status == "cancelled" {
		steps = append(steps, models.OrderStep{Code: "cancelled", Label: "Order cancelled", At: created.Format(time.RFC3339), Done: true})
	}
	return steps
}

// ---------- 通知 ----------

// seedNotifications 8 条站内通知，前 7 条对演示会员保持未读
func seedNotifications(now time.Time) error {
	list := []models.Notification{
		{ID: "offer-15", Kind: "offer", Title: "New offer", Description: "Enjoy the special offer up to 15% off on every fresh vegetable box.", Link: &models.Link{Label: "去逛逛", Route: "/shop"}},
		{ID: "payment-weekly", Kind: "payment", Title: "Payment received", Description: "We received $26.60 for order FM20260206. Receipt is ready in your order list.", Link: &models.Link{Label: "查看订单", Route: "/orders"}},
		{ID: "promo-weekend", Kind: "promo", Title: "Weekend promo", Description: "Free delivery on all orders above $20 this weekend only.", Link: &models.Link{Label: "查看我的券包", Route: "/vouchers"}},
		{ID: "offer-harvest", Kind: "offer", Title: "Harvest pick", Description: "Sweet corn is back in stock and packed this morning.", Link: &models.Link{Label: "去逛逛", Route: "/shop"}},
		{ID: "payment-refund", Kind: "payment", Title: "Refund issued", Description: "$5.00 was refunded to your original payment method.", Link: &models.Link{Label: "查看订单", Route: "/orders"}},
		{ID: "promo-live", Kind: "promo", Title: "Live chat open", Description: "Our support team is online until 21:00 for order questions.", Link: &models.Link{Label: "联系客服", Route: "/chat"}},
		{ID: "offer-address", Kind: "offer", Title: "Address check", Description: "Add a second delivery address to split orders between home and office.", Link: &models.Link{Label: "去管理地址", Route: "/addresses"}},
		{ID: "promo-help", Kind: "promo", Title: "New help topics", Description: "We added answers about missing items and refund timing.", Link: &models.Link{Label: "查看帮助", Route: "/help"}},
	}
	for i := range list {
		list[i].CreatedAt = now.Add(time.Duration(-3*(i+1)) * time.Hour)
		if i < 7 {
			list[i].ReadBy = []string{}
		} else {
			list[i].ReadBy = []string{demoAdminID, demoMemberID}
		}
		if err := insertDoc(config.Collections.Notifications, &list[i]); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 帮助与客服 ----------

// seedFAQs 四条帮助问题，触发词供客服自动回复使用
func seedFAQs() error {
	list := []models.Faq{
		{
			ID: "not-delivered", Question: "My order didn’t delivered", Sort: 1,
			Answer:   "订单仍在 On going 里说明尚未送达：自提订单在门店保留 24 小时后自动取消并原路退款，配送订单超过预计时间 2 小时仍未更新状态可转人工客服。",
			Link:     &models.Link{Label: "查看订单状态", Route: "/orders"},
			Triggers: []string{"deliver", "delivery", "not arrive", "shipping", "没收到", "未送达", "什么时候到", "物流"},
		},
		{
			ID: "missing-items", Question: "My order came with missing items", Sort: 2,
			Answer:   "少发的行项目按「单价 × 数量」单独退款，退款只影响缺失部分，其余商品照常结算。可在订单卡片的 Total Payment 核对原始金额。",
			Link:     &models.Link{Label: "核对订单金额", Route: "/orders"},
			Triggers: []string{"missing", "fewer", "wrong item", "少发", "漏发", "少了", "错发"},
		},
		{
			ID: "change-address", Question: "How do I change my delivery address?", Sort: 3,
			Answer:   "在 My Address 中新增或编辑地址，结算时默认使用带「默认」标签的那一个；删除默认地址后会自动回退到列表中的第一个。",
			Link:     &models.Link{Label: "去管理地址", Route: "/addresses"},
			Triggers: []string{"address", "delivery address", "shipping address", "地址", "收货", "改址"},
		},
		{
			ID: "refund", Question: "How can I refund my order?", Sort: 4,
			Answer:   "取消后款项原路退回，已抵扣的优惠券在订单取消后退回券包；配送费按门槛重算，满 $20 免运费。",
			Link:     &models.Link{Label: "查看我的券包", Route: "/vouchers"},
			Triggers: []string{"refund", "cancel", "money back", "退款", "取消", "退钱"},
		},
	}
	for i := range list {
		if err := insertDoc(config.Collections.FAQs, &list[i]); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 法务文案 ----------

// seedLegal 条款与隐私文案，注册页与设置页共用
func seedLegal(now time.Time) error {
	docs := []models.LegalDoc{
		{
			ID: "terms", Title: "Terms of Use", UpdatedAt: now,
			Body: "本服务仅用于演示：下单、优惠券与退款流程中的金额均由服务端计算，商品数据可由运营中台随时调整。请勿在演示账号中录入真实支付信息。",
		},
		{
			ID: "privacy", Title: "Privacy Policy", UpdatedAt: now,
			Body: "我们只保存完成订单所需的姓名、手机号与收货地址；密码以 bcrypt 哈希存储，会话令牌保存在 HttpOnly Cookie 中，退出登录即刻失效。",
		},
	}
	for i := range docs {
		if err := insertDoc(config.Collections.LegalDocs, &docs[i]); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 引导页 ----------

// seedOnboarding 三页引导文案，{stat} 占位由接口统计实时替换
func seedOnboarding(urls map[string]string) error {
	list := []models.OnboardingSlide{
		{ID: "s1", Title: "Welcome to Grocery Shopping", Description: "Your items has been placed and is on it’s way to being processed", ImageURL: urls["cat-vegetables"], Sort: 1},
		{ID: "s2", Title: "Fresh picks every day", Description: "{category_count} 个生鲜分类、{product_count} 款在售商品，首页两列列表向下滑动即可加载更多。", ImageURL: urls["cat-meat"], Sort: 2},
		{ID: "s3", Title: "Save on every basket", Description: "券包里现有 {voucher_count} 张券，${lowest_spend} 起就能抵扣，满 ${free_delivery_threshold} 免运费。", ImageURL: urls["cat-dairy"], Sort: 3},
	}
	for i := range list {
		if err := insertDoc(config.Collections.Onboarding, &list[i]); err != nil {
			return err
		}
	}
	return nil
}

// ---------- 通用 ----------

// insertDoc 写入单条文档
func insertDoc(col string, doc interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := config.Col(col).InsertOne(ctx, doc)
	return err
}

// itoa 整数转字符串
func itoa(v int) string { return strconv.Itoa(v) }

// newObjectID 生成 24 位十六进制 ID
func newObjectID() string { return primitive.NewObjectID().Hex() }
