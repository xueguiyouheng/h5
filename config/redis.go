// config 配置模块
// redis.go Redis 客户端初始化
// 采用优雅降级策略：Redis 连接失败时 RedisEnabled=false，业务代码走纯 DB 模式
package config

import (
	"fmt"
	"log"
	"time"

	"github.com/go-redis/redis"
)

// RDB 全局 Redis 客户端实例
var RDB *redis.Client

// RedisEnabled Redis 是否可用
var RedisEnabled bool

// InitRedis 初始化 Redis 连接
func InitRedis() {
	addr := getEnv("REDIS_ADDR", "127.0.0.1:6379")
	password := getEnv("REDIS_PASSWORD", "")
	db := getEnvInt("REDIS_DB", 0)

	RDB = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		PoolTimeout:  4 * time.Second,
	})

	if err := RDB.Ping().Err(); err != nil {
		log.Printf("⚠️  Redis 连接失败: %v (运行在无缓存模式)", err)
		RedisEnabled = false
		RDB = nil
		return
	}

	RedisEnabled = true
	fmt.Println("Redis 连接成功")
}
