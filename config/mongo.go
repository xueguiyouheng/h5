// config 配置模块
// mongo.go 初始化 MongoDB 连接，商城业务数据（商品/订单/会员等）全部存放在 Mongo
// MySQL 与 Redis 的原有职责保持不变
package config

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MDB 全局 MongoDB 客户端
var MDB *mongo.Client

// FreshMart 商城业务库
var FreshMart *mongo.Database

// MongoEnabled 标记 Mongo 是否可用，不可用时业务层直接返回 500 而不是 panic
var MongoEnabled bool

// MongoDBName 库名，可用 MONGO_DB 覆盖
var MongoDBName = getEnv("MONGO_DB", "freshmart")

// Collections 本服务使用的集合名
var Collections = struct {
	Members        string
	Stores         string
	Categories     string
	Subcategories  string
	Products       string
	Carousels      string
	Carts          string
	Vouchers       string
	RedeemCodes    string
	Favorites      string
	Addresses      string
	Orders         string
	Payments       string
	Notifications  string
	FAQs           string
	ChatMessages   string
	MemberSettings string
	LegalDocs      string
	Uploads        string
	Onboarding     string
}{
	Members:        "members",
	Stores:         "stores",
	Categories:     "categories",
	Subcategories:  "subcategories",
	Products:       "products",
	Carousels:      "carousels",
	Carts:          "carts",
	Vouchers:       "vouchers",
	RedeemCodes:    "redeem_codes",
	Favorites:      "favorites",
	Addresses:      "addresses",
	Orders:         "orders",
	Payments:       "payments",
	Notifications:  "notifications",
	FAQs:           "faqs",
	ChatMessages:   "chat_messages",
	MemberSettings: "member_settings",
	LegalDocs:      "legal_docs",
	Uploads:        "uploads",
	Onboarding:     "onboarding_slides",
}

// InitMongo 连接 MongoDB 并选择商城库
// Redis 同款优雅降级策略：连接失败只告警，不阻塞服务启动
func InitMongo() {
	uri := getEnv("MONGO_URI", "mongodb://127.0.0.1:27017")
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().
		ApplyURI(uri).
		SetConnectTimeout(5*time.Second).
		SetServerSelectionTimeout(5*time.Second))
	if err != nil {
		log.Printf("⚠️  MongoDB 连接失败: %v (商城数据接口将返回 500)", err)
		return
	}
	if err = client.Ping(ctx, nil); err != nil {
		log.Printf("⚠️  MongoDB Ping 失败: %v (商城数据接口将返回 500)", err)
		return
	}

	MDB = client
	FreshMart = client.Database(MongoDBName)
	MongoEnabled = true
	fmt.Printf("MongoDB 连接成功: %s / 库 %s\n", uri, MongoDBName)

	EnsureIndexes()
}

// InitMongoForSeed 供种子脚本使用：连不上直接报错，不做优雅降级
func InitMongoForSeed() error {
	InitMongo()
	if !MongoEnabled {
		return fmt.Errorf("无法连接 MongoDB，请确认 docker 容器已启动")
	}
	return nil
}

// CloseMongo 释放连接
func CloseMongo() {
	if MDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = MDB.Disconnect(ctx)
}

// Col 返回指定集合的句柄
func Col(name string) *mongo.Collection {
	if FreshMart == nil {
		return nil
	}
	return FreshMart.Collection(name)
}

// EnsureIndexes 建立业务唯一约束，使重复注册/重复领券能被识别
func EnsureIndexes() {
	if !MongoEnabled {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	specs := []struct {
		collection string
		keys       bson.D
		unique     bool
	}{
		{Collections.Members, bson.D{{Key: "email", Value: 1}}, true},
		{Collections.Members, bson.D{{Key: "mobile", Value: 1}}, true},
		// 门店归属商家账号，附近店铺按营业状态取数
		{Collections.Stores, bson.D{{Key: "owner_member_id", Value: 1}}, false},
		{Collections.Stores, bson.D{{Key: "status", Value: 1}}, false},
		{Collections.Carts, bson.D{{Key: "member_id", Value: 1}}, true},
		{Collections.Favorites, bson.D{{Key: "member_id", Value: 1}, {Key: "product_id", Value: 1}}, true},
		// 类目名在门店内唯一即可，多店并存后全局唯一会互相撞名
		{Collections.Categories, bson.D{{Key: "store_id", Value: 1}, {Key: "name", Value: 1}}, true},
		{Collections.Products, bson.D{{Key: "category_id", Value: 1}}, false},
		{Collections.Products, bson.D{{Key: "store_id", Value: 1}, {Key: "status", Value: 1}}, false},
		{Collections.Orders, bson.D{{Key: "member_id", Value: 1}, {Key: "tab", Value: 1}}, false},
		{Collections.Orders, bson.D{{Key: "store_id", Value: 1}, {Key: "status", Value: 1}}, false},
		{Collections.Payments, bson.D{{Key: "order_id", Value: 1}, {Key: "status", Value: 1}}, false},
		{Collections.ChatMessages, bson.D{{Key: "member_id", Value: 1}, {Key: "created_at", Value: 1}}, false},
	}
	for _, spec := range specs {
		index := mongo.IndexModel{
			Keys:    spec.keys,
			Options: options.Index().SetUnique(spec.unique).SetSparse(true),
		}
		if _, err := Col(spec.collection).Indexes().CreateOne(ctx, index); err != nil {
			log.Printf("⚠️  创建索引失败 %s: %v", spec.collection, err)
		}
	}
}

// M 把 map[string]interface{} 原样转成 bson.M
func M(doc map[string]interface{}) bson.M {
	return bson.M(doc)
}
