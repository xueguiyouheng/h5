// cmd/migrate_store 把门店改造前的存量数据归到一家默认门店
// 新代码一律按 store_id 取数，缺这个字段的历史文档在买家端和中台都会凭空消失，因此升级后必须先跑本脚本
// 脚本可重复执行：只处理没有 store_id 的文档，已有门店时沿用而不新建
// 用法（在项目根目录执行）: go run cmd/migrate_store/main.go [-owner admin@sso.local] [-dry-run]
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"go-gin/config"
	"go-gin/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	// defaultStoreID / defaultStoreName 仅在库里还没有门店时使用
	defaultStoreID   = "store-1"
	defaultStoreName = "FreshMart 旗舰店"
	// legacyIndex 旧版类目名全局唯一索引，多店并存后要让位给 {store_id,name}
	legacyIndex = "name_1"
)

// unscoped 命中「没有 store_id 字段」和「store_id 为空串」两种历史写法
var unscoped = bson.M{"store_id": bson.M{"$in": []interface{}{"", nil}}}

// missingPaymentStatus 改造前下的单没有支付状态，运营中台会一律判成未付款而拦住状态流转
var missingPaymentStatus = bson.M{"payment_status": bson.M{"$in": []interface{}{"", nil}}}

// paymentSuccess 与 payment 包里的 statusSuccess 对应，成功支付过的单才算已付款
const paymentSuccess = "success"

// ownerMail 默认门店的归属人邮箱，对应用户表里已有的后台账号
var ownerMail string

// dry 只统计不改库
var dry bool

func main() {
	flag.StringVar(&ownerMail, "owner", "admin@sso.local", "默认门店归属的商家邮箱，账号不存在则门店不绑归属人")
	flag.BoolVar(&dry, "dry-run", false, "只统计待迁移文档，不写库")
	flag.Parse()

	if err := config.InitMongoForSeed(); err != nil {
		log.Fatalf("连接 MongoDB 失败: %v", err)
	}
	defer config.CloseMongo()

	if err := run(); err != nil {
		log.Fatalf("迁移失败: %v", err)
	}
	if dry {
		fmt.Println("以上为 -dry-run 统计结果，未写入任何数据")
	}
}

func run() error {
	if dry {
		return report()
	}

	target, err := ensureStore()
	if err != nil {
		return err
	}
	if err := backfillDocs(target); err != nil {
		return err
	}
	if err := migrateCarts(target); err != nil {
		return err
	}
	if err := fillOrderSnapshot(); err != nil {
		return err
	}
	if err := setDefaultStore(target); err != nil {
		return err
	}
	return dropLegacyIndex()
}

// report dry-run 下只统计各集合里还缺 store_id 的文档数
func report() error {
	names := []string{
		config.Collections.Products, config.Collections.Categories,
		config.Collections.Carousels, config.Collections.Orders,
	}
	for _, name := range names {
		n, err := count(config.Col(name), unscoped)
		if err != nil {
			return err
		}
		fmt.Printf("%-12s 待迁移 %d 条\n", name, n)
	}
	n, err := count(config.Col(config.Collections.Orders), missingPaymentStatus)
	if err != nil {
		return err
	}
	fmt.Printf("%-12s 待补支付状态 %d 条\n", config.Collections.Orders, n)
	return nil
}

// ensureStore 库里已有门店就沿用 ID 最小的那家，否则建一家默认门店
func ensureStore() (*models.Store, error) {
	col := config.Col(config.Collections.Stores)
	var store models.Store
	found, err := findOne(col, bson.M{}, &store)
	if err != nil {
		return nil, err
	}
	if found {
		fmt.Printf("已存在门店 %s (%s)，存量数据全部归到它\n", store.Name, store.ID)
		return &store, nil
	}

	owner, err := memberByEmail(ownerMail)
	if err != nil {
		return nil, err
	}
	if owner == "" {
		fmt.Printf("⚠️  会员 %s 不存在，默认门店不绑归属人，商家需事后补 owner_member_id\n", ownerMail)
	}
	now := time.Now().UTC()
	store = models.Store{
		ID: defaultStoreID, Name: defaultStoreName, Address: "Menara FreshMart, Jalan Ampang, 50450 Kuala Lumpur",
		Longitude: 101.6869, Latitude: 3.1390, DeliveryRadiusKM: 12,
		MinOrderAmount: "20.00", Status: models.StoreStatusOpen,
		OwnerMemberID: owner, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := col.InsertOne(context.Background(), &store); err != nil {
		return nil, err
	}
	fmt.Printf("已创建默认门店 %s (%s)\n", store.Name, store.ID)
	return &store, nil
}

// backfillDocs 把商品、类目、轮播、订单归到目标门店
func backfillDocs(target *models.Store) error {
	sets := []struct {
		collection string
		set        bson.M
	}{
		{config.Collections.Products, bson.M{"store_id": target.ID}},
		{config.Collections.Categories, bson.M{"store_id": target.ID}},
		{config.Collections.Carousels, bson.M{"store_id": target.ID}},
		// 订单要把店名一起快照下来，中台列表和买家详情页都直接读这个字段
		{config.Collections.Orders, bson.M{"store_id": target.ID, "store_name": target.Name}},
	}
	for _, spec := range sets {
		res, err := config.Col(spec.collection).UpdateMany(context.Background(), unscoped, bson.M{"$set": spec.set})
		if err != nil {
			return err
		}
		fmt.Printf("%-12s 回填 store_id %d 条\n", spec.collection, res.ModifiedCount)
	}
	return nil
}

// migrateCarts 购物车行只存了 product_id，store_id 要按所属商品反查后逐条改写
func migrateCarts(target *models.Store) error {
	filter := bson.M{"lines": bson.M{"$elemMatch": unscoped}}
	cur, err := config.Col(config.Collections.Carts).Find(context.Background(), filter)
	if err != nil {
		return err
	}
	defer cur.Close(context.Background())

	cache := map[string]string{}
	var migrated int
	for cur.Next(context.Background()) {
		var cart models.Cart
		if err := cur.Decode(&cart); err != nil {
			return err
		}
		changed := false
		for i := range cart.Lines {
			if cart.Lines[i].StoreID != "" {
				continue
			}
			storeID, err := productStore(cache, cart.Lines[i].ProductID, target.ID)
			if err != nil {
				return err
			}
			cart.Lines[i].StoreID = storeID
			changed = true
		}
		if !changed {
			continue
		}
		_, err = config.Col(config.Collections.Carts).ReplaceOne(context.Background(), bson.M{"_id": cart.ID}, &cart)
		if err != nil {
			return err
		}
		migrated++
	}
	if err := cur.Err(); err != nil {
		return err
	}
	fmt.Printf("%-12s 回填 store_id %d 条\n", config.Collections.Carts, migrated)
	return nil
}

// productStore 取商品所属门店，查不到的历史商品挂到默认门店；结果缓存避免重复查库
func productStore(cache map[string]string, productID, fallback string) (string, error) {
	if id, ok := cache[productID]; ok {
		return id, nil
	}
	var product models.Product
	found, err := findOne(config.Col(config.Collections.Products), bson.M{"_id": productID}, &product)
	if err != nil {
		return "", err
	}
	storeID := fallback
	if found && product.StoreID != "" {
		storeID = product.StoreID
	}
	cache[productID] = storeID
	return storeID, nil
}

// fillOrderSnapshot 老订单缺中台要用的字段：支付状态按支付单判定，收货人与地址明细从会员/地址补
// 不补 payment_status 的话这些单会被运营中台一律当成未付款，状态流转按钮全被拦住
func fillOrderSnapshot() error {
	cur, err := config.Col(config.Collections.Orders).Find(context.Background(), missingPaymentStatus)
	if err != nil {
		return err
	}
	defer cur.Close(context.Background())

	cache := &snapshotCache{payments: map[string]payInfo{}, members: map[string]models.Member{}}
	var migrated int
	for cur.Next(context.Background()) {
		var order models.Order
		if err := cur.Decode(&order); err != nil {
			return err
		}
		sets, err := orderSnapshot(cache, &order)
		if err != nil {
			return err
		}
		_, err = config.Col(config.Collections.Orders).UpdateOne(context.Background(),
			bson.M{"_id": order.ID}, bson.M{"$set": sets})
		if err != nil {
			return err
		}
		migrated++
	}
	if err := cur.Err(); err != nil {
		return err
	}
	fmt.Printf("%-12s 补齐处理字段 %d 条\n", config.Collections.Orders, migrated)
	return nil
}

// orderSnapshot 算出这一单要补的字段
func orderSnapshot(cache *snapshotCache, order *models.Order) (bson.M, error) {
	sets := bson.M{}
	status, paidAt, err := cache.paymentStatus(order.ID)
	if err != nil {
		return nil, err
	}
	sets["payment_status"] = status
	if paidAt != "" {
		sets["paid_at"] = paidAt
	}
	member, err := cache.member(order.MemberID)
	if err != nil {
		return nil, err
	}
	if order.Receiver == "" && member.Username != "" {
		sets["receiver"] = member.Username
	}
	if order.ReceiverPhone == "" && member.Mobile != "" {
		sets["receiver_phone"] = member.Mobile
	}
	if order.AddressDetail == "" && order.AddressID != "" {
		detail, err := cache.addressDetail(order.AddressID)
		if err != nil {
			return nil, err
		}
		if detail != "" {
			sets["address_detail"] = detail
		}
	}
	return sets, nil
}

// payInfo 支付单里迁移关心的两个字段
type payInfo struct{ status, paidAt string }

// snapshotCache 逐单回查支付单/会员/地址，结果缓存住避免重复查库
type snapshotCache struct {
	payments map[string]payInfo
	members  map[string]models.Member
}

// paymentStatus 有成功支付单即为已付款，否则记为未付款
func (c *snapshotCache) paymentStatus(orderID string) (string, string, error) {
	if info, ok := c.payments[orderID]; ok {
		return info.status, info.paidAt, nil
	}
	var doc struct {
		Status string `bson:"status"`
		PaidAt string `bson:"paid_at"`
	}
	found, err := findOne(config.Col(config.Collections.Payments),
		bson.M{"order_id": orderID, "status": paymentSuccess}, &doc)
	if err != nil {
		return "", "", err
	}
	info := payInfo{status: "unpaid"}
	if found {
		info = payInfo{status: "paid", paidAt: doc.PaidAt}
	}
	c.payments[orderID] = info
	return info.status, info.paidAt, nil
}

// member 取下单会员，档案不存在时返回零值让调用方跳过补写
func (c *snapshotCache) member(memberID string) (models.Member, error) {
	if member, ok := c.members[memberID]; ok {
		return member, nil
	}
	var member models.Member
	found, err := findOne(config.Col(config.Collections.Members), bson.M{"_id": memberID}, &member)
	if err != nil {
		return models.Member{}, err
	}
	if !found {
		member = models.Member{}
	}
	c.members[memberID] = member
	return member, nil
}

// addressDetail 取下单时关联的地址明细
func (c *snapshotCache) addressDetail(addressID string) (string, error) {
	var address models.Address
	found, err := findOne(config.Col(config.Collections.Addresses), bson.M{"_id": addressID}, &address)
	if err != nil || !found {
		return "", err
	}
	return address.Detail, nil
}

// setDefaultStore 买家还没选过店时，把默认门店写成刚归集的那家
func setDefaultStore(target *models.Store) error {
	filter := bson.M{"default_store_id": bson.M{"$in": []interface{}{"", nil}}}
	res, err := config.Col(config.Collections.Members).UpdateMany(context.Background(), filter,
		bson.M{"$set": bson.M{"default_store_id": target.ID}})
	if err != nil {
		return err
	}
	fmt.Printf("%-12s 设置默认门店 %d 条\n", config.Collections.Members, res.ModifiedCount)
	return nil
}

// dropLegacyIndex 删掉类目名全局唯一索引，否则第二家店加同名类目会被拦住
func dropLegacyIndex() error {
	view := config.Col(config.Collections.Categories).Indexes()
	specs, err := view.ListSpecifications(context.Background())
	if err != nil {
		return err
	}
	for _, spec := range specs {
		if spec.Name != legacyIndex {
			continue
		}
		if _, err := view.DropOne(context.Background(), legacyIndex); err != nil {
			return err
		}
		fmt.Printf("已删除旧索引 %s.%s\n", config.Collections.Categories, legacyIndex)
		return nil
	}
	return nil
}

// memberByEmail 按邮箱取会员 ID，不存在返回空串
func memberByEmail(email string) (string, error) {
	var member models.Member
	found, err := findOne(config.Col(config.Collections.Members), bson.M{"email": email}, &member)
	if err != nil || !found {
		return "", err
	}
	return member.ID, nil
}

// findOne 取过滤条件下 _id 最小的一条并解码到 out，没有数据返回 false
func findOne(col *mongo.Collection, filter bson.M, out interface{}) (bool, error) {
	cur, err := col.Find(context.Background(), filter, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}).SetLimit(1))
	if err != nil {
		return false, err
	}
	defer cur.Close(context.Background())
	if !cur.Next(context.Background()) {
		return false, cur.Err()
	}
	if err := cur.Decode(out); err != nil {
		return false, err
	}
	return true, cur.Err()
}

// count 统计符合条件的文档数
func count(col *mongo.Collection, filter bson.M) (int64, error) {
	return col.CountDocuments(context.Background(), filter)
}
