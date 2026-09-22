// config 数据库配置模块
// 负责初始化 MySQL 数据库连接池，供全局使用
package config

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	// MySQL 驱动，通过 _ 导入触发其 init() 注册
	_ "github.com/go-sql-driver/mysql"
)

// DB 全局数据库连接池实例
// database/sql 已内置连接池机制，通过 SetMaxOpenConns / SetMaxIdleConns 等控制参数
var DB *sql.DB

// JwtSecret JWT 签名密钥
// 优先从环境变量 JWT_SECRET 读取，未设置时使用默认值
// 生产环境务必通过环境变量注入强随机密钥，不要使用默认值
var JwtSecret = []byte(getEnv("JWT_SECRET", "go-gin-default-secret-change-me"))

// CookieName JWT Cookie 名称
const CookieName = "sso_token"

// CookiePath Cookie 作用域路径
// 设置为 /api 可以让 Cookie 仅在 API 路径下生效
const CookiePath = "/"

// CookieSameSite Cookie SameSite 策略
// Lax: 阻止跨站 POST 携带，允许顶级导航携带，平衡安全性和易用性
const CookieSameSite = "Lax"

// CookieSecure Cookie 是否仅 HTTPS 传输
// 生产环境 (非 debug) 自动启用，开发环境本地 HTTP 允许
var CookieSecure bool

// CookieHTTPOnly 是否禁止 JS 访问 Cookie
// 设为 true 可彻底杜绝 XSS 窃取令牌的风险
const CookieHTTPOnly = true

// CookieMaxAge Cookie 最大存活时间，与 JWT 过期时间保持一致 (24 小时)
const CookieMaxAge = 24 * time.Hour

// InitCookieConfig 根据运行模式初始化 Cookie Secure 属性
// 生产环境强制 Secure=true，开发环境允许 HTTP
func InitCookieConfig() {
	CookieSecure = os.Getenv("GIN_MODE") == "release" || getEnv("COOKIE_SECURE", "false") == "true"
	fmt.Printf("Cookie Secure: %v (debug mode cookie works over HTTP)\n", CookieSecure)
}

// getEnv 读取环境变量，不存在时返回默认值
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvInt 读取环境变量并解析为整数
func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

// InitDB 初始化数据库连接池
// DSN 格式: user:password@tcp(host:port)/dbname?charset=utf8mb4&parseTime=True&loc=Local
// 连接池配置说明:
//   - SetMaxOpenConns(100): 最大同时打开的连接数，防止高并发打满 MySQL 连接上限
//   - SetMaxIdleConns(20): 最大空闲连接数，避免频繁创建/销毁连接
//   - SetConnMaxLifetime(time.Hour): 连接最大存活时间，防止长时间使用的连接被 MySQL 服务端主动断开
func InitDB() {
	var err error
	dsn := "root:rootpassword@tcp(127.0.0.1:3306)/sso_system?charset=utf8mb4&parseTime=True&loc=Local"
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}

	// 配置连接池参数
	DB.SetMaxOpenConns(getEnvInt("DB_MAX_OPEN_CONNS", 100))
	DB.SetMaxIdleConns(getEnvInt("DB_MAX_IDLE_CONNS", 20))
	DB.SetConnMaxLifetime(time.Hour)

	// 验证连接是否可用
	if err = DB.Ping(); err != nil {
		log.Fatalf("数据库 Ping 失败: %v", err)
	}

	fmt.Println("数据库连接成功")
}
