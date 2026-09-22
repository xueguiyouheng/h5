// routers 路由层
// 注册所有 HTTP 路由和中间件，定义 URL 与 Controller 的映射关系
package routers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go-gin/controllers"
	"go-gin/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRouter 配置并返回 Gin 路由引擎实例
// 中间件执行顺序: CORS -> CSRF -> ResponseMiddleware 全局生效，限流仅作用于 /api 分组
// 路由分组:
//   - 公开: 登录 / 注册 / 找回密码 / 小程序授权登录 / 引导页 / 法务文案 / 客服时段
//   - 需鉴权: 登出、小程序身份绑定、店铺、购物车、券、地址、订单、支付、通知、帮助、会话、资料、设置、上传
//   - 需商家身份: /api/admin/*（门店资料、轮播、类目、商品、订单处理、统计），作用域锁定在自家门店
//   - /swagger/*  接口文档；/uploads/* 上传素材静态托管
//   - 生产环境: 前端产物静态托管 + 前端路由兜底
func SetupRouter() *gin.Engine {
	r := gin.Default()

	// 全局中间件
	r.Use(middleware.CORSMiddleware())     // CORS 跨域 (支持 Cookie 凭证)
	r.Use(middleware.CSRFMiddleware())     // CSRF 防护
	r.Use(middleware.ResponseMiddleware()) // 统一响应格式

	// 初始化控制器
	homeController := controllers.NewHomeController()
	userController := controllers.NewUserController()
	authController := controllers.NewAuthController()
	mpAuthController := controllers.NewMPAuthController()
	accountController := controllers.NewAccountController()
	shopController := controllers.NewShopController()
	tradeController := controllers.NewTradeController()
	contentController := controllers.NewContentController()
	adminController := controllers.NewAdminController()
	// 支付模块自带 HTTP 出口，路由前缀 /api/payment；订单适配器与会员解析由控制器接线注入
	paymentModule := controllers.NewPaymentModule()

	// 首页路由
	r.GET("/", homeController.GetHello)

	// 上传素材由本地目录托管，数据库只保存 URL
	r.Static("/uploads", "./uploads")
	registerSwaggerRoutes(r)

	api := r.Group("/api")
	api.Use(middleware.RateLimitMiddleware(time.Minute, 300)) // 限流：每 IP 每分钟 300 次，不含 /uploads 静态素材
	{
		// ---------- 公开接口 ----------
		api.POST("/login", authController.Login)
		// 小程序授权登录：此刻客户端还没有任何会话，与 /api/login 同语义，因此同批豁免 CSRF
		api.POST("/miniprogram/wechat/login", mpAuthController.WechatLogin)
		api.POST("/register", accountController.Register)
		api.POST("/auth/password/reset", accountController.RequestPasswordReset)
		api.POST("/auth/password/reset-verify", accountController.VerifyPasswordReset)
		api.GET("/onboarding/slides", accountController.Onboarding)
		api.GET("/legal/:key", accountController.Legal)
		api.GET("/support/status", contentController.SupportStatus)

		// 渠道公网回调 + 模拟渠道的唤起落点：都不带 Cookie 不带会话，回调靠渠道验签识别来源，因此不能挂 protected
		paymentModule.RegisterPublic(api) // POST /api/payment/notify/:provider、GET /api/payment/mock/launch

		// ---------- 需登录接口 ----------
		protected := api.Group("")
		protected.Use(middleware.JWTAuthMiddleware())
		{
			protected.POST("/logout", authController.Logout)
			// 小程序里用密码登录后绑微信身份：已登录态的写操作，靠 Bearer 载体过 CSRF，不豁免
			protected.POST("/miniprogram/bind", mpAuthController.BindWechat)
			protected.GET("/users", userController.GetUsers)
			protected.GET("/users/:id", userController.GetUserByID)

			protected.GET("/auth/me", accountController.Me)
			protected.GET("/profile", accountController.Me)
			protected.PUT("/profile", accountController.UpdateProfile)
			protected.GET("/profile/completeness", accountController.Completeness)
			protected.POST("/onboarding/complete", accountController.MarkOnboarded)
			protected.GET("/settings", accountController.Settings)
			protected.PUT("/settings", accountController.SaveSettings)
			protected.POST("/settings/ratings", accountController.AddRating)

			shop := protected.Group("/shop")
			{
				shop.GET("/home", shopController.Home)
				shop.GET("/carousel", shopController.Carousel)
				shop.GET("/categories", shopController.Categories)
				shop.GET("/categories/:category_id", shopController.Category)
				// 商品列表唯一入口：搜索、类目、版块、收藏只靠过滤字段区分
				shop.GET("/products", shopController.Products)
				shop.GET("/products/:product_id", shopController.ProductDetail)
				shop.POST("/favorites", shopController.ToggleFavorite)
				shop.DELETE("/favorites", shopController.RemoveFavorites)
				shop.GET("/search/hot", shopController.HotSearch)
				// 买家侧的门店：附近店铺列表与切店，切店后一切数据都归属新店
				shop.GET("/stores/nearby", shopController.NearbyStores)
				shop.PUT("/stores/selection", shopController.SelectStore)
			}

			cart := protected.Group("/cart")
			{
				cart.GET("", tradeController.GetCart)
				cart.DELETE("", tradeController.ClearCart)
				cart.POST("/items", tradeController.AddCartItem)
				cart.POST("/items/batch", tradeController.AddCartItemsBatch)
				cart.PATCH("/items/:id", tradeController.SetCartItemQty)
				cart.DELETE("/items/:id", tradeController.RemoveCartItem)
				cart.PUT("/selection", tradeController.UpdateSelection)
				cart.POST("/checkout-preview", tradeController.CheckoutPreview)
			}

			vouchers := protected.Group("/vouchers")
			{
				vouchers.GET("", tradeController.Vouchers)
				vouchers.GET("/available", tradeController.AvailableVouchers)
				vouchers.POST("/redeem", tradeController.RedeemVoucher)
			}

			addresses := protected.Group("/addresses")
			{
				addresses.GET("", tradeController.Addresses)
				addresses.POST("", tradeController.CreateAddress)
				addresses.PATCH("/:id", tradeController.UpdateAddress)
				addresses.DELETE("/:id", tradeController.DeleteAddress)
				addresses.PUT("/:id/default", tradeController.SetDefaultAddress)
			}

			orders := protected.Group("/orders")
			{
				orders.GET("", tradeController.Orders)
				orders.POST("", tradeController.CreateOrder)
				orders.GET("/:id", tradeController.OrderDetail)
				orders.POST("/:id/cancel", tradeController.CancelOrder)
				orders.GET("/:id/track", tradeController.TrackOrder)
			}

			// 支付接口全部由模块自己注册：prepay / query / launch / mock-notify
			paymentModule.RegisterMember(protected)

			notifications := protected.Group("/notifications")
			{
				notifications.GET("", contentController.Notifications)
				notifications.GET("/unread-count", contentController.UnreadCount)
				notifications.POST("/read", contentController.MarkRead)
				notifications.POST("/read-all", contentController.MarkAllRead)
			}

			help := protected.Group("/help")
			{
				help.GET("/faqs", contentController.FAQs)
				help.POST("/faqs/:id/vote", contentController.VoteFaq)
			}

			chat := protected.Group("/chat")
			{
				chat.GET("/messages", contentController.ChatMessages)
				chat.POST("/messages", contentController.SendChatMessage)
				chat.DELETE("/messages", contentController.ClearChat)
			}

			protected.POST("/uploads", contentController.UploadImage)
			protected.GET("/uploads", contentController.Uploads)
			protected.DELETE("/uploads/:id", contentController.DeleteUpload)

			// ---------- 运营中台：仅拥有门店的商家账号，且作用域锁在自家门店 ----------
			admin := protected.Group("/admin")
			admin.Use(controllers.AdminShopScope())
			{
				admin.GET("/stats", adminController.Stats)

				admin.GET("/store", adminController.StoreProfile)
				admin.PUT("/store", adminController.SaveStoreProfile)

				admin.GET("/carousel", adminController.Carousels)
				admin.POST("/carousel", adminController.CreateCarousel)
				admin.PUT("/carousel/:id", adminController.UpdateCarousel)
				admin.DELETE("/carousel/:id", adminController.DeleteCarousel)

				admin.GET("/categories", adminController.Categories)
				admin.POST("/categories", adminController.CreateCategory)
				admin.GET("/categories/:id", adminController.Category)
				admin.PUT("/categories/:id", adminController.UpdateCategory)
				admin.DELETE("/categories/:id", adminController.DeleteCategory)

				admin.GET("/products", adminController.Products)
				admin.POST("/products", adminController.CreateProduct)
				admin.GET("/products/:id", adminController.Product)
				admin.PUT("/products/:id", adminController.UpdateProduct)
				admin.PUT("/products/:id/status", adminController.SetProductStatus)
				admin.DELETE("/products/:id", adminController.DeleteProduct)

				// 订单处理：看板计数走静态路径，先于 /orders/:id 注册
				admin.GET("/orders", adminController.Orders)
				admin.GET("/orders/summary", adminController.OrderSummary)
				admin.GET("/orders/:id", adminController.OrderDetail)
				admin.PUT("/orders/:id/status", adminController.SetOrderStatus)
				admin.POST("/orders/:id/cancel", adminController.CancelOrder)
				admin.PUT("/orders/:id/remark", adminController.UpdateOrderRemark)
				admin.PUT("/orders/:id/shipping", adminController.UpdateOrderShipping)
			}
		}
	}

	serveFrontend(r)
	return r
}

// serveFrontend 生产环境下托管前端产物，并为前端路由做兜底
func serveFrontend(r *gin.Engine) {
	distDir, err := filepath.Abs("frontend/dist")
	if err != nil {
		r.NoRoute(notFoundHandler)
		return
	}
	if _, err := os.Stat(distDir); err != nil {
		r.NoRoute(notFoundHandler)
		return
	}

	r.Static("/assets", filepath.Join(distDir, "assets"))
	r.StaticFile("/favicon.svg", filepath.Join(distDir, "favicon.svg"))
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			middleware.Error(c, http.StatusNotFound, "接口不存在")
			return
		}
		c.File(filepath.Join(distDir, "index.html"))
	})
}

// notFoundHandler 未构建前端产物时的兜底响应
func notFoundHandler(c *gin.Context) {
	if strings.HasPrefix(c.Request.URL.Path, "/api/") {
		middleware.Error(c, http.StatusNotFound, "接口不存在")
		return
	}
	middleware.Error(c, http.StatusNotFound, "页面不存在")
}
