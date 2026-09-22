// utils 通用工具包
// 提供 JWT 令牌的签发与解析功能
// 引入 jti (JWT ID) 用于令牌黑名单机制：登出时按 jti 拉黑，过期自动清除
package utils

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/dgrijalva/jwt-go"
)

// Claims JWT 声明结构
// 在标准声明基础上扩展用户 ID 和用户名
// StandardClaims.Id 即为 jti (JWT ID)，用于黑名单识别
type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	// MemberID 商城会员 ID（Mongo members._id）；仅商城账号登录时携带
	MemberID string `json:"member_id,omitempty"`
	jwt.StandardClaims
}

// GenerateToken 签发 JWT 令牌
// 使用 HS256 算法签名，自动生成随机 jti 用于后续黑名单机制
func GenerateToken(userID int, username string, secret []byte, expire time.Duration) (string, error) {
	return generateToken(userID, username, "", secret, expire)
}

// GenerateMemberToken 为商城会员签发 JWT 令牌，额外携带 member_id
func GenerateMemberToken(memberID, username string, secret []byte, expire time.Duration) (string, error) {
	return generateToken(0, username, memberID, secret, expire)
}

// generateToken 签发 JWT 令牌的公共实现
func generateToken(userID int, username, memberID string, secret []byte, expire time.Duration) (string, error) {
	now := time.Now()
	jtiBytes := make([]byte, 16)
	if _, err := rand.Read(jtiBytes); err != nil {
		return "", err
	}

	claims := Claims{
		UserID:   userID,
		Username: username,
		MemberID: memberID,
		StandardClaims: jwt.StandardClaims{
			Issuer:    "go-gin",
			IssuedAt:  now.Unix(),
			ExpiresAt: now.Add(expire).Unix(),
			Id:        hex.EncodeToString(jtiBytes),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// ParseToken 解析并校验 JWT 令牌
// 校验签名和有效期，返回解析出的 Claims（含 jti）
func ParseToken(tokenString string, secret []byte) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("非法的签名算法")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("无效的令牌")
}
