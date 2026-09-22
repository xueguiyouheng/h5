// cmd/seed 演示数据入口
// 用法（在项目根目录执行）: go run cmd/seed/main.go
package main

import (
	"log"

	"go-gin/seed"
)

func main() {
	if err := seed.Run(); err != nil {
		log.Fatalf("种子数据失败: %v", err)
	}
}
