// services 业务逻辑层
// UserService 封装用户相关的数据库操作 + Redis Cache-Aside 缓存
//
// 缓存策略 (Redis 可用时自动启用，不可用时优雅降级):
//   user:detail:{id}            → 用户详情 JSON (TTL 5min)
//   user:detail:name:{username} → 按用户名查用户 (TTL 5min)
//   user:list:p:{page}:s:{ps}   → 分页结果 JSON (TTL 2min)
//   user:count                  → 用户总数 (TTL 5min)
//
// Cache-Aside 模式:
//   先查 Redis → 命中直接返回 → 未命中查 MySQL → 写入 Redis → 返回
package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"go-gin/config"
	"go-gin/models"
)

// UserService 用户业务服务
type UserService struct{}

// NewUserService 创建用户服务实例
func NewUserService() *UserService {
	return &UserService{}
}

const userSelectColumns = "id, username, email, password_hash, systems_access, is_active, created_at, updated_at"

// cacheTTL 缓存过期时间
const (
	userDetailTTL = 5 * time.Minute
	userListTTL   = 2 * time.Minute
	userCountTTL  = 5 * time.Minute
)

// GetUsers 分页查询用户列表 (Cache-Aside)
func (s *UserService) GetUsers(pagination *models.Pagination) (*models.PageResult, error) {
	if config.RedisEnabled {
		cacheKey := fmt.Sprintf("user:list:p:%d:s:%d", pagination.Page, pagination.PageSize)
		val, err := config.RDB.Get(cacheKey).Result()
		if err == nil {
			var result models.PageResult
			if json.Unmarshal([]byte(val), &result) == nil {
				return &result, nil
			}
		}
	}

	total, err := s.CountUsers()
	if err != nil {
		return nil, err
	}

	rows, err := config.DB.Query(
		"SELECT "+userSelectColumns+" FROM users ORDER BY id ASC LIMIT ? OFFSET ?",
		pagination.PageSize, pagination.Offset(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]models.User, 0)
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.SystemsAccess, &user.IsActive, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	result := &models.PageResult{
		List:     users,
		Total:    total,
		Page:     pagination.Page,
		PageSize: pagination.PageSize,
	}

	if config.RedisEnabled {
		cacheKey := fmt.Sprintf("user:list:p:%d:s:%d", pagination.Page, pagination.PageSize)
		if data, err := json.Marshal(result); err == nil {
			_ = config.RDB.Set(cacheKey, data, userListTTL).Err()
		}
	}

	return result, nil
}

// CountUsers 统计用户总数 (Cache-Aside)
func (s *UserService) CountUsers() (int64, error) {
	if config.RedisEnabled {
		val, err := config.RDB.Get("user:count").Int64()
		if err == nil {
			return val, nil
		}
	}

	var total int64
	err := config.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&total)
	if err != nil {
		return 0, err
	}

	if config.RedisEnabled {
		_ = config.RDB.Set("user:count", total, userCountTTL).Err()
	}

	return total, nil
}

// GetUserByUsername 根据用户名查询单个用户 (Cache-Aside)
func (s *UserService) GetUserByUsername(username string) (*models.User, error) {
	if config.RedisEnabled {
		cacheKey := fmt.Sprintf("user:detail:name:%s", username)
		val, err := config.RDB.Get(cacheKey).Result()
		if err == nil {
			var user models.User
			if json.Unmarshal([]byte(val), &user) == nil {
				return &user, nil
			}
		}
	}

	user, err := s.queryUser("SELECT "+userSelectColumns+" FROM users WHERE username = ?", username)
	if err != nil {
		return nil, err
	}

	if user != nil && config.RedisEnabled {
		s.cacheUser(fmt.Sprintf("user:detail:name:%s", username), user)
	}

	return user, nil
}

// GetUserByID 根据 ID 查询单个用户 (Cache-Aside)
func (s *UserService) GetUserByID(id int) (*models.User, error) {
	if config.RedisEnabled {
		cacheKey := fmt.Sprintf("user:detail:%d", id)
		val, err := config.RDB.Get(cacheKey).Result()
		if err == nil {
			var user models.User
			if json.Unmarshal([]byte(val), &user) == nil {
				return &user, nil
			}
		}
	}

	user, err := s.queryUser("SELECT "+userSelectColumns+" FROM users WHERE id = ?", id)
	if err != nil {
		return nil, err
	}

	if user != nil && config.RedisEnabled {
		s.cacheUser(fmt.Sprintf("user:detail:%d", id), user)
	}

	return user, nil
}

// queryUser 通用单用户查询
func (s *UserService) queryUser(query string, args ...interface{}) (*models.User, error) {
	var user models.User
	err := config.DB.QueryRow(query, args...).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.SystemsAccess, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// cacheUser 将用户信息写入 Redis 缓存
func (s *UserService) cacheUser(key string, user *models.User) {
	data, err := json.Marshal(user)
	if err != nil {
		return
	}
	_ = config.RDB.Set(key, data, userDetailTTL).Err()
}
