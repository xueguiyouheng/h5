// models 数据模型模块
// 定义数据库表结构对应的 Go 结构体，以及统一的 API 响应格式
package models

import "time"

// User 用户模型
// 对应数据库 users 表，使用 json tag 控制 JSON 序列化字段
// PasswordHash 字段使用 json:"-" 标签，表示在 JSON 响应中隐藏密码哈希
type User struct {
	ID            int       `json:"id"`             // 用户 ID，主键自增
	Username      string    `json:"username"`       // 用户名，唯一
	Email         string    `json:"email"`          // 邮箱，唯一
	PasswordHash  string    `json:"-"`              // 密码哈希（bcrypt 加密），不在前端展示
	SystemsAccess string    `json:"systems_access"` // 可访问的系统列表，JSON 数组格式存储
	IsActive      bool      `json:"is_active"`      // 账号是否启用
	CreatedAt     time.Time `json:"created_at"`     // 创建时间
	UpdatedAt     time.Time `json:"updated_at"`     // 更新时间
}
