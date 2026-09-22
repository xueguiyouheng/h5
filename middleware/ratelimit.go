// middleware 中间件层
// ratelimit.go 基于内存的令牌桶限流实现
// 支持按 IP 限流，防止单 IP 高并发请求打垮服务
// 使用 sync.Mutex 保证并发安全，通过后台 goroutine 定期清理过期记录
package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter 限流器核心结构
// 使用固定窗口算法：每个 IP 从窗口起点起累计 maxReq 次请求，窗口到期后清零
type RateLimiter struct {
	mu       sync.Mutex          // 互斥锁，保证并发安全
	visitors map[string]*visitor  // IP 访问记录映射，key 为客户端 IP
	rate     time.Duration       // 限流时间窗口，如 1 分钟
	maxReq   int                 // 窗口内允许的最大请求数
}

// visitor 访问记录
// count: 当前窗口内已请求次数，windowStart: 当前窗口的起点（固定窗口，到点即清零）
type visitor struct {
	count       int
	windowStart time.Time
}

// NewRateLimiter 创建限流器实例
// rate: 时间窗口大小，maxReq: 窗口内最大请求数
// 启动后台协程每分钟清理一次过期的 IP 记录，防止内存泄漏
func NewRateLimiter(rate time.Duration, maxReq int) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		maxReq:   maxReq,
	}
	// 启动后台清理协程，定期删除过期的 IP 记录
	go rl.cleanup()
	return rl
}

// cleanup 后台清理过期的 IP 访问记录
// 每隔 1 分钟扫描一次，删除超过限流窗口时间未访问的 IP 记录
func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(time.Minute)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			// 窗口已过期且无新请求，回收该 IP 记录
			if time.Since(v.windowStart) > rl.rate {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Allow 检查指定 IP 是否允许请求
// 返回 true 表示允许请求，false 表示超出限流阈值
// 逻辑:
//  1. 如果 IP 首次访问，创建记录并允许
//  2. 如果当前窗口已到期，重开窗口并从 1 重新计数
//  3. 否则窗口内计数 +1，未超过 maxReq 则允许，超过则拒绝
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists {
		// 首次访问，创建记录
		rl.visitors[ip] = &visitor{count: 1, windowStart: time.Now()}
		return true
	}

	// 窗口到期，从零重新计数
	if time.Since(v.windowStart) > rl.rate {
		v.count = 1
		v.windowStart = time.Now()
		return true
	}

	v.count++
	return v.count <= rl.maxReq
}

// RateLimitMiddleware 限流中间件工厂函数
// 创建限流器实例，返回 gin 中间件处理函数
// 超出限流时返回 HTTP 429 (Too Many Requests) 并调用 c.Abort() 终止请求
// 默认配置：每分钟最多 60 次请求
func RateLimitMiddleware(rate time.Duration, maxReq int) gin.HandlerFunc {
	limiter := NewRateLimiter(rate, maxReq)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.Allow(ip) {
			// 超出限流阈值，返回 429 状态码
			Error(c, http.StatusTooManyRequests, "请求过于频繁，请稍后重试")
			c.Abort()
			return
		}
		c.Next()
	}
}