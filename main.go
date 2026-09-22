// main 程序入口
// 负责初始化数据库连接、Cookie 配置、设置路由、启动 HTTP 服务
//
// @title FreshMart 生鲜商城 API
// @version 1.0
// @description 商城前端与运营中台共用的后端接口。响应统一信封 {code,message,data}；
// @description 认证为 HttpOnly Cookie sso_token，写操作需回传 X-CSRF-Token。
// @description 文档生成：swag init -g main.go -o docs/swagger，访问 /swagger/index.html
// @BasePath /api
// @schemes http https
// @Accept json
// @Produce json
// @securityDefinitions.apikey CookieAuth
// @in cookie
// @name sso_token
package main

import (
	"log"
	"os"

	"go-gin/config"   // 数据库 & Cookie 配置
	"go-gin/routers"  // 路由配置
	"go-gin/services" // 上传目录初始化
)

// listenAddr 监听地址，PORT 可覆盖默认 8080
func listenAddr() string {
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return ":8080"
}

func main() {
	// 初始化 MySQL 连接池
	config.InitDB()

	// 初始化 Redis 缓存 (优雅降级：失败不阻塞启动)
	config.InitRedis()

	// 初始化 MongoDB (商城业务数据)
	config.InitMongo()

	// 初始化 Cookie 安全配置 (Secure/HttpOnly/SameSite)
	config.InitCookieConfig()

	// 准备图片上传目录
	if err := services.EnsureUploadRoot(); err != nil {
		log.Printf("⚠️  上传目录初始化失败: %v", err)
	}

	// 配置路由并启动服务
	r := routers.SetupRouter()
	r.Run(listenAddr())
}
