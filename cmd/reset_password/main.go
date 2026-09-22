// 开发辅助工具：重置 admin 账号密码
// 用法: go run ./cmd/reset_password
package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// 生成新密码的 bcrypt 哈希
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("生成哈希失败: %v", err)
	}

	db, err := sql.Open("mysql", "root:rootpassword@tcp(127.0.0.1:3306)/sso_system?charset=utf8mb4&parseTime=True&loc=Local")
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec("UPDATE users SET password_hash = ? WHERE username = 'admin'", string(hash)); err != nil {
		log.Fatalf("更新密码失败: %v", err)
	}

	fmt.Println("admin 密码已重置为 admin123")
}