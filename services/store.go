// services 业务逻辑层
// store.go 商城 Mongo 数据访问的公共底座：错误类型、金额换算、ID 生成、通用查询
package services

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go-gin/config"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// defaultCtxTimeout 单次数据操作的超时
const defaultCtxTimeout = 8 * time.Second

// newContext 生成带超时的上下文
func newContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), defaultCtxTimeout)
}

// APIError 带 HTTP 状态码的业务错误，控制器据此回写统一信封
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return e.Message }

// newErr 构造业务错误
func newErr(status int, format string, args ...interface{}) error {
	return &APIError{Status: status, Message: fmt.Sprintf(format, args...)}
}

// ErrNotFound 资源不存在
func ErrNotFound(msg string) error { return newErr(404, "%s", msg) }

// ErrBadRequest 参数校验失败
func ErrBadRequest(msg string) error { return newErr(400, "%s", msg) }

// ErrConflict 唯一约束或状态冲突
func ErrConflict(msg string) error { return newErr(409, "%s", msg) }

// ErrUnprocessable 业务规则不满足
func ErrUnprocessable(msg string) error { return newErr(422, "%s", msg) }

// ErrMongoOff Mongo 未就绪
var ErrMongoOff = newErr(500, "服务暂不可用")

// checkMongo 数据操作前置检查
func checkMongo() error {
	if !config.MongoEnabled {
		return ErrMongoOff
	}
	return nil
}

// newID 生成 24 位十六进制文档 ID
func newID() string { return primitive.NewObjectID().Hex() }

// money 把浮点数格式化为两位小数字符串
func money(v float64) string {
	if v < 0 {
		v = 0
	}
	return strconv.FormatFloat(round2(v), 'f', 2, 64)
}

// round2 四舍五入到分
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// priceValue 解析金额字符串，容忍前端传来的 "$4.99 / kg" 这类文案
func priceValue(s string) float64 {
	re := regexp.MustCompile(`-?\d+(\.\d+)?`)
	got := re.FindString(s)
	if got == "" {
		return 0
	}
	v, err := strconv.ParseFloat(got, 64)
	if err != nil {
		return 0
	}
	return v
}

// normalizePrice 把任意输入金额文案规范成两位小数字符串
func normalizePrice(s string) string { return money(priceValue(s)) }

// currencySymbol 币种符号，未知币种回落到币种码
func currencySymbol(code string) string {
	switch strings.ToUpper(code) {
	case "USD":
		return "$"
	case "MYR":
		return "RM"
	case "CNY":
		return "¥"
	default:
		return strings.ToUpper(code) + " "
	}
}

// atoi 容错的整数解析
func atoi(s string) int {
	v, _ := strconv.Atoi(strings.TrimSpace(s))
	return v
}

// atoiDefault 带默认值的整数解析
func atoiDefault(s string, def int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}

// clampPageSize 分页参数收敛，上限 50
func clampPageSize(v, def int) int {
	if v <= 0 {
		return def
	}
	if v > 50 {
		return 50
	}
	return v
}

// clampPage 页码从 1 开始
func clampPage(v int) int {
	if v <= 0 {
		return 1
	}
	return v
}

// firstNonEmpty 返回第一个非空字符串
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// normalizeStatus 上下架状态只允许 on / off
func normalizeStatus(s string) string {
	if s == "off" {
		return "off"
	}
	return "on"
}

// isDuplicateErr 判断唯一索引冲突
func isDuplicateErr(err error) bool {
	if err == nil {
		return false
	}
	if mongo.IsDuplicateKeyError(err) {
		return true
	}
	return strings.Contains(err.Error(), "E11000")
}

// parseTime 解析 RFC3339 时间，失败返回零值
func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(s))
	if err != nil {
		return time.Time{}
	}
	return t
}

// timeRange 把 since/until 转成 created_at 的范围条件
func timeRange(since, until string) bson.M {
	cond := bson.M{}
	if t := parseTime(since); !t.IsZero() {
		cond["$gte"] = t
	}
	if t := parseTime(until); !t.IsZero() {
		cond["$lte"] = t
	}
	return cond
}

// orFilters 组装 $or 条件
func orFilters(filters ...bson.M) bson.M {
	list := make([]bson.M, 0, len(filters))
	for _, f := range filters {
		list = append(list, f)
	}
	return bson.M{"$or": list}
}

// andFilters 组装 $and 条件
func andFilters(filters ...bson.M) bson.M {
	list := make([]bson.M, 0, len(filters))
	for _, f := range filters {
		list = append(list, f)
	}
	return bson.M{"$and": list}
}

// keywordFilter 把关键词转成不区分大小写的模糊匹配条件
func keywordFilter(keyword, field string) bson.M {
	filter := bson.M{}
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return filter
	}
	filter[field] = bson.M{"$regex": regexp.QuoteMeta(keyword), "$options": "i"}
	return filter
}

// countDocs 统计集合内符合条件的文档数
func countDocs(col string, filter bson.M) (int64, error) {
	if err := checkMongo(); err != nil {
		return 0, err
	}
	ctx, cancel := newContext()
	defer cancel()
	return config.Col(col).CountDocuments(ctx, filter)
}

// findDocs 按过滤条件取文档，proj 可为 nil
func findDocs(col string, filter bson.M, sortKey string, desc bool, limit, skip int, out interface{}) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()

	opts := options.Find().SetLimit(int64(limit)).SetSkip(int64(skip))
	if sortKey != "" {
		dir := int64(1)
		if desc {
			dir = -1
		}
		sort := bson.D{{Key: sortKey, Value: dir}}
		// 同排序值必须用 _id 兜底，否则翻页时顺序不稳定会重复/漏项
		if sortKey != "_id" {
			sort = append(sort, bson.E{Key: "_id", Value: int64(1)})
		}
		opts = opts.SetSort(sort)
	}
	cur, err := config.Col(col).Find(ctx, filter, opts)
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	return cur.All(ctx, out)
}

// findOneDoc 取单条文档，未命中返回 nil
func findOneDoc(col string, filter bson.M, out interface{}) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	err := config.Col(col).FindOne(ctx, filter).Decode(out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	return err
}

// insertDoc 插入文档
func insertDoc(col string, doc interface{}) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(col).InsertOne(ctx, doc)
	return err
}

// replaceDoc 按 _id 整体替换
func replaceDoc(col, id string, doc interface{}) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(col).ReplaceOne(ctx, bson.M{"_id": id}, doc)
	return err
}

// updateDoc 按 _id 做字段更新
func updateDoc(col, id string, fields bson.M) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(col).UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": fields})
	return err
}

// deleteDoc 按 _id 删除
func deleteDoc(col, id string) error {
	if err := checkMongo(); err != nil {
		return err
	}
	ctx, cancel := newContext()
	defer cancel()
	_, err := config.Col(col).DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// deleteDocs 按条件批量删除
func deleteDocs(col string, filter bson.M) error {
	_, err := deleteDocsCounted(col, filter)
	return err
}

// deleteDocsCounted 按条件批量删除并回删除条数
func deleteDocsCounted(col string, filter bson.M) (int64, error) {
	if err := checkMongo(); err != nil {
		return 0, err
	}
	ctx, cancel := newContext()
	defer cancel()
	res, err := config.Col(col).DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	if res == nil {
		return 0, nil
	}
	return res.DeletedCount, nil
}
