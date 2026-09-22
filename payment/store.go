// payment 支付模块
// store.go 支付单的数据访问底座：本模块自己持有 mongo 依赖，不借用 services 的内部 helper
package payment

import (
	"context"
	"errors"
	"time"

	"go-gin/config"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// storeTimeout 单次数据操作的超时
const storeTimeout = 8 * time.Second

// newContext 生成带超时的上下文
func newContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), storeTimeout)
}

// checkStore 数据操作前置检查
func checkStore() error {
	if !config.MongoEnabled {
		return ErrStoreOff
	}
	return nil
}

// newID 生成 24 位十六进制文档 ID，同时作为商户侧 out_trade_no
func newID() string { return primitive.NewObjectID().Hex() }

// findOneDoc 取单条文档，未命中返回 nil
// 条件用普通 map 表达，bson 只在本文件出现，业务层不必引驱动包
func findOneDoc(filter map[string]interface{}, out interface{}) error {
	if err := checkStore(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	err := config.Col(config.Collections.Payments).FindOne(ctx, config.M(filter)).Decode(out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	return err
}

// insertDoc 插入支付单
func insertDoc(doc interface{}) error {
	if err := checkStore(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Payments).InsertOne(ctx, doc)
	return err
}

// settleDoc 条件更新把 pending 推向终态，返回是否由本次调用完成迁移
// 三条结算入口（模拟回调、公网回调、主动查单）并发时只有一份能改动，幂等就靠这个条件
func settleDoc(id string, succeeded bool, tradeNo, paidAt, reason string) (bool, error) {
	if err := checkStore(); err != nil {
		return false, err
	}
	fields := map[string]interface{}{"status": statusFailed}
	if succeeded {
		fields["status"] = statusSuccess
		fields["trade_no"] = tradeNo
		fields["paid_at"] = paidAt
	}
	if reason != "" {
		fields["fail_reason"] = reason
	}
	ctx, cancel := newContext()
	defer cancel()
	res, err := config.Col(config.Collections.Payments).UpdateOne(ctx,
		bson.M{"_id": id, "status": statusPending},
		bson.M{"$set": fields},
	)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// closeDoc 超时关单，只影响仍处于 pending 的支付单
func closeDoc(id string) error {
	if err := checkStore(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(config.Collections.Payments).UpdateOne(ctx,
		bson.M{"_id": id, "status": statusPending},
		bson.M{"$set": map[string]interface{}{
			"status":      statusClosed,
			"fail_reason": timeoutReason,
		}},
	)
	return err
}
