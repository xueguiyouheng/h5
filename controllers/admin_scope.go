// controllers 控制层
// admin_scope.go 运营中台的门店作用域中间件
// 放在 controllers 包而不是 middleware 包：middleware 一旦被 services 引用就会成环
// （services → payment → payment/http → middleware）
package controllers

import (
	"net/http"

	"go-gin/middleware"

	"github.com/gin-gonic/gin"
)

// AdminShopScope 中台入口收口：只有名下有门店的商家账号能进，且只能操作自己那家店
// 校验通过后把门店 ID 注入 ctx，控制器一律从这里取作用域，不接受请求参数里的 store_id
func AdminShopScope() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		member, err := currentMember(ctx)
		if err != nil {
			fail(ctx, err)
			ctx.Abort()
			return
		}
		store, err := shopService.FirstOwnedStore(member.ID)
		if err != nil {
			fail(ctx, err)
			ctx.Abort()
			return
		}
		if store == nil {
			middleware.Error(ctx, http.StatusForbidden, "该账号没有可运营的门店，请使用商家账号注册")
			ctx.Abort()
			return
		}
		ctx.Set("storeID", store.ID)
		ctx.Set("memberID", member.ID)
		ctx.Next()
	}
}
