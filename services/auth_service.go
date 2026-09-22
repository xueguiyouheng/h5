// services 业务逻辑层
// AuthService 封装登录认证逻辑 + Redis 登录防暴力破解
//
// 登录限流策略 (Redis 可用时自动启用):
//   login:fail:{ip}:{username} → 失败次数 (TTL 15min)
//   login:lock:{ip}:{username} → 锁定标记 (TTL 15min)
//   阈值: 5 次失败 → 锁定 15 分钟
//   登录成功 → 清除失败计数
package services

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"
	"go-gin/utils"

	"golang.org/x/crypto/bcrypt"
)

// AuthService 认证业务服务
type AuthService struct{}

// NewAuthService 创建认证服务实例
func NewAuthService() *AuthService {
	return &AuthService{}
}

const tokenExpire = 24 * time.Hour

// loginMaxAttempts 15 分钟内最大失败次数，超过后锁定
const loginMaxAttempts = 5

// loginLockDuration 锁定持续时间
const loginLockDuration = 15 * time.Minute

// Login 用户登录
// account 可以是 SSO 用户名，也可以是商城会员的邮箱/用户名；ip 用于登录限流
// 流程: 检查锁定 → 查 MySQL 用户 → 命中则校验密码并签发后台令牌
//
//	→ 未命中则查 Mongo 会员 → 校验密码并签发会员令牌
//	→ 两者都失败按一次登录失败计数
func (s *AuthService) Login(account, password, ip string) (string, error) {
	if strings.TrimSpace(account) == "" {
		return "", errors.New("请输入账号")
	}

	if config.RedisEnabled {
		locked, ttl := s.isLoginLocked(ip, account)
		if locked {
			return "", fmt.Errorf("该账号尝试次数过多，请 %.0f 秒后再试", ttl.Seconds())
		}
	}

	user, err := s.getUserForLogin(account)
	if err != nil {
		return "", err
	}
	if user != nil {
		return s.loginAsSSOUser(user, password, ip, account)
	}

	member, err := NewMemberService().FindByAccount(account)
	if err != nil {
		return "", err
	}
	if member == nil {
		s.recordLoginFail(ip, account)
		return "", errors.New("用户名或密码错误")
	}
	if !VerifyPassword(member, password) {
		s.recordLoginFail(ip, account)
		return "", errors.New("用户名或密码错误")
	}

	token, err := utils.GenerateMemberToken(member.ID, member.Username, config.JwtSecret, tokenExpire)
	if err != nil {
		return "", err
	}
	s.clearLoginFail(ip, account)
	return token, nil
}

// loginAsSSOUser 校验 SSO 后台账号并签发令牌
func (s *AuthService) loginAsSSOUser(user *models.User, password, ip, account string) (string, error) {
	if !user.IsActive {
		return "", errors.New("账号已被禁用")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		s.recordLoginFail(ip, account)
		return "", errors.New("用户名或密码错误")
	}
	token, err := utils.GenerateToken(user.ID, user.Username, config.JwtSecret, tokenExpire)
	if err != nil {
		return "", err
	}
	s.clearLoginFail(ip, account)
	return token, nil
}

// isLoginLocked 检查 (ip+username) 是否被锁定，返回锁定状态和剩余时间
func (s *AuthService) isLoginLocked(ip, username string) (bool, time.Duration) {
	key := fmt.Sprintf("login:lock:%s:%s", ip, username)
	ttl, err := config.RDB.TTL(key).Result()
	if err != nil {
		return false, 0
	}
	return ttl > 0, ttl
}

// recordLoginFail 记录一次登录失败
func (s *AuthService) recordLoginFail(ip, username string) {
	if !config.RedisEnabled {
		return
	}
	countKey := fmt.Sprintf("login:fail:%s:%s", ip, username)
	count, err := config.RDB.Incr(countKey).Result()
	if err != nil {
		return
	}
	if count == 1 {
		_ = config.RDB.Expire(countKey, loginLockDuration).Err()
	}
	if count >= loginMaxAttempts {
		lockKey := fmt.Sprintf("login:lock:%s:%s", ip, username)
		_ = config.RDB.Set(lockKey, "1", loginLockDuration).Err()
	}
}

// clearLoginFail 登录成功后清除失败计数
func (s *AuthService) clearLoginFail(ip, username string) {
	if !config.RedisEnabled {
		return
	}
	_ = config.RDB.Del(fmt.Sprintf("login:fail:%s:%s", ip, username)).Err()
}

// getUserForLogin 登录场景专用：强制查 DB，不走缓存
// 因为密码哈希不能暴露给 Redis 缓存 (models.User.PasswordHash 有 json:"-" tag)
// 账号可以是用户名，也可以是邮箱
func (s *AuthService) getUserForLogin(account string) (*models.User, error) {
	var user models.User
	err := config.DB.QueryRow(
		"SELECT id, username, email, password_hash, systems_access, is_active, created_at, updated_at FROM users WHERE username = ? OR email = ?",
		account, account,
	).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.SystemsAccess, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}
