// controllers 控制层
// context.go 控制器公共辅助：会员身份解析、分页参数、错误回写
package controllers

import (
	"net/http"
	"strconv"

	"go-gin/middleware"
	"go-gin/models"
	"go-gin/services"

	"github.com/gin-gonic/gin"
)

var memberService = services.NewMemberService()

var shopService = services.NewShopService()

// queryFloat 读取浮点查询参数，非法或缺省时回退
func queryFloat(ctx *gin.Context, key string, def float64) float64 {
	raw := ctx.Query(key)
	if raw == "" {
		return def
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return def
	}
	return v
}

// buyerStore 买家身份 + 当前门店：商城侧一切取数都锁在这家店上
// 环境里一家门店都没有时回 nil，接口按空数据返回而不是报错
func buyerStore(ctx *gin.Context) (*models.Store, *models.Member, error) {
	member, err := currentMember(ctx)
	if err != nil {
		return nil, nil, err
	}
	store, err := shopService.ResolveStore(member)
	if err != nil {
		return nil, member, err
	}
	return store, member, nil
}

// buyerScope 只要门店 ID 的场景
func buyerScope(ctx *gin.Context) (string, *models.Member, error) {
	store, member, err := buyerStore(ctx)
	if err != nil || store == nil {
		return "", member, err
	}
	return store.ID, member, nil
}

// markMerchant 出参里标出商家身份与自己名下的门店
// 买家账号没有门店，is_admin 为 false，前端因此不显示运营中台入口
func markMerchant(member *models.Member) error {
	list, err := shopService.OwnedStores(member.ID)
	if err != nil {
		return err
	}
	if len(list) == 0 {
		if member.AccountType == "" {
			member.AccountType = models.AccountTypeBuyer
		}
		return nil
	}
	member.IsAdmin = true
	member.AccountType = models.AccountTypeMerchant
	member.OwnedStoreID = list[0].ID
	member.OwnedStoreName = list[0].Name
	return nil
}

// currentMember 解析当前请求对应的商城会员
// 商城账号直接从 JWT 取 member_id；SSO 后台账号首次访问时自动建档
func currentMember(ctx *gin.Context) (*models.Member, error) {
	if id := ctx.GetString("memberID"); id != "" {
		member, err := memberService.ByID(id)
		if err != nil {
			return nil, err
		}
		if member == nil {
			return nil, &services.APIError{Status: http.StatusUnauthorized, Message: "账号不存在，请重新登录"}
		}
		return member, nil
	}

	userID := ctx.GetInt("userID")
	if userID <= 0 {
		return nil, &services.APIError{Status: http.StatusUnauthorized, Message: "登录状态已失效"}
	}
	return memberService.EnsureForSSOUser(userID, ctx.GetString("username"))
}

// currentMemberID 只需要会员 ID 的场景
func currentMemberID(ctx *gin.Context) (string, error) {
	member, err := currentMember(ctx)
	if err != nil {
		return "", err
	}
	return member.ID, nil
}

// MemberID 暴露给支付模块的会员解析：模块只要一个会员 ID，不依赖控制器其余部分
func MemberID(ctx *gin.Context) (string, error) {
	return currentMemberID(ctx)
}

// fail 把业务错误映射为统一响应信封
func fail(ctx *gin.Context, err error) {
	if apiErr, ok := err.(*services.APIError); ok {
		middleware.Error(ctx, apiErr.Status, apiErr.Message)
		return
	}
	middleware.Error(ctx, http.StatusInternalServerError, "服务暂不可用")
}

// pageParam 读取分页参数
func pageParam(ctx *gin.Context, defaultSize int) (int, int) {
	return queryInt(ctx, "page", 1), queryInt(ctx, "page_size", defaultSize)
}

// queryInt 读取整数查询参数
func queryInt(ctx *gin.Context, key string, def int) int {
	raw := ctx.Query(key)
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return v
}

// bindJSON 统一处理请求体解析错误
func bindJSON(ctx *gin.Context, obj interface{}) bool {
	if err := ctx.ShouldBindJSON(obj); err != nil {
		middleware.Error(ctx, http.StatusBadRequest, "无效的请求参数")
		return false
	}
	return true
}

// ok 回写成功响应
func ok(ctx *gin.Context, data interface{}) {
	middleware.Success(ctx, data)
}
