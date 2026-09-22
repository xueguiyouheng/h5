// payment 支付模块
// crypto.go 渠道签名底座：RSA2 签验、密钥解析、待签串拼装
// 支付宝 sign 与微信 Authorization 都用这套，差异只在待签串格式，由各自的 provider 文件负责
package payment

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"sort"
	"strings"
)

// ensurePEM 密钥既可能是带头的 PEM，也可能是密钥工具产出的裸 base64，统一补成 PEM
func ensurePEM(material, blockType string) []byte {
	trimmed := strings.TrimSpace(material)
	if strings.HasPrefix(trimmed, "-----BEGIN") {
		return []byte(trimmed)
	}
	var out bytes.Buffer
	if err := pem.Encode(&out, &pem.Block{Type: blockType, Bytes: mustDecodeBase64(trimmed)}); err != nil {
		return nil
	}
	return out.Bytes()
}

func mustDecodeBase64(s string) []byte {
	if data, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(s), "")); err == nil {
		return data
	}
	return nil
}

// decodeBase64 兼容渠道回传里的标准与 URL 安全变体
func decodeBase64(s string) ([]byte, error) {
	if data, err := base64.StdEncoding.DecodeString(s); err == nil {
		return data, nil
	}
	data, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("报文 base64 解码失败")
	}
	return data, nil
}

// parseRSAPrivateKey 应用/商户私钥，PKCS#1 与 PKCS#8 两种投递形态都支持
func parseRSAPrivateKey(material string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(ensurePEM(material, "PRIVATE KEY"))
	if block == nil {
		return nil, fmt.Errorf("私钥格式无法解析")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("私钥格式无法解析")
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("私钥不是 RSA 类型")
	}
	return key, nil
}

// parseRSAPublicKey 渠道公钥/平台证书公钥，PEM 证书与裸 base64 均可
func parseRSAPublicKey(material string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(ensurePEM(material, "PUBLIC KEY"))
	if block == nil {
		return nil, fmt.Errorf("公钥格式无法解析")
	}
	if cert, err := x509.ParseCertificate(block.Bytes); err == nil {
		if pub, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			return pub, nil
		}
		return nil, fmt.Errorf("证书公钥不是 RSA 类型")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		if key, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
			return key, nil
		}
		return nil, fmt.Errorf("公钥格式无法解析")
	}
	pub, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("公钥不是 RSA 类型")
	}
	return pub, nil
}

// rsa256Sign RSA2(SHA256withRSA) 签名，支付宝 sign 与微信 Authorization 都用它
func rsa256Sign(key *rsa.PrivateKey, content string) (string, error) {
	sum := sha256.Sum256([]byte(content))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", fmt.Errorf("签名失败")
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// rsa256Verify 验签，签名串非法时按失败处理而不是 panic
func rsa256Verify(pub *rsa.PublicKey, content, signature string) bool {
	sig, err := decodeBase64(signature)
	if err != nil {
		return false
	}
	sum := sha256.Sum256([]byte(content))
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig) == nil
}

// sortedQuery 按字典序拼 key=value&，空值与 sign 不参与（支付宝待签串规则）
func sortedQuery(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		if k == "sign" || k == "sign_type" || params[k] == "" {
			continue
		}
		pairs = append(pairs, k+"="+params[k])
	}
	return strings.Join(pairs, "&")
}
