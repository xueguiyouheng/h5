// models 数据模型模块
// 定义登录请求结构
package models

// LoginRequest 登录请求体
// 前端提交账号与密码，账号可以是 SSO 用户名，也可以是商城会员的邮箱、用户名或手机号
// Email 字段是历史兼容位（登录页早期 label 为 Email address），与 Username 二选一，后者优先
type LoginRequest struct {
	Username string `json:"username"`                    // 用户名、邮箱或手机号
	Email    string `json:"email"`                       // 邮箱，语义同上
	Password string `json:"password" binding:"required"` // 密码，必填
}

// Account 取有效账号，username 优先
func (r *LoginRequest) Account() string {
	if r.Username != "" {
		return r.Username
	}
	return r.Email
}

// LoginResponse 登录响应数据
// 登录成功后返回访问令牌及令牌类型
type LoginResponse struct {
	Token     string `json:"token"`      // JWT 访问令牌
	TokenType string `json:"token_type"` // 令牌类型，固定为 Bearer
}
