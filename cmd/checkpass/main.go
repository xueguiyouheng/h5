// 开发辅助工具：验证 bcrypt 密码哈希与候选密码是否匹配
// 用法: go run ./cmd/checkpass
// 说明: 用于排查测试账号明文密码，生产环境请勿使用
package main

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	hash := "$2b$10$8K1p/a0dURXAm7QiTRqNa.E3YPWs8UkrpC4biQz8dJTwE6hekKc5y"
	passwords := []string{
		"admin", "password", "123456", "admin123", "password123", "test",
		"secret", "12345678", "root", "adminadmin", "Admin@123", "pass",
		"hello", "sso", "sso123", "admin@example.com", "1234", "qwerty",
		"Password123", "admin1234", "admin@123", "123456789", "abc123",
		"test123", "1234567890", "password1", "admin1", "111111", "000000",
		"admin123!", "Admin123", "adminpass", "admin_password", "sso_system",
		"admin1234!", "P@ssw0rd", "changeme", "letmein", "iloveyou",
	}
	for _, p := range passwords {
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil {
			fmt.Println("MATCH:", p)
			return
		}
	}
	fmt.Println("NO MATCH")
}