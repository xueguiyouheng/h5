// payment 支付模块
// client.go 渠道外呼底座与回调应答：真实请求的构造、超时与响应上限
//
// mock 的注入点在 provider.go 的响应报文层，这里的外呼代码在 mock 下根本不会被执行，
// 因此不需要任何 if 分支——真实渠道接入时这段代码一行都不用改。
package payment

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strconv"
	"time"
)

const (
	// payHTTPTimeout 渠道外呼超时，回调侧由渠道自身重试，不做长时间挂起
	payHTTPTimeout = 10 * time.Second
	// notifyMaxSkew 回调时间戳允许的偏差，超出按重放处理
	notifyMaxSkew = 5 * time.Minute
	// responseLimit 渠道响应体读取上限，防御异常大报文
	responseLimit = 1 << 20
)

// httpClient 渠道外呼专用客户端，超时兜底避免拖垮请求线程
var httpClient = &http.Client{Timeout: payHTTPTimeout}

// doRequest 真实外呼
// 非 2xx 一律失败，响应体不回传给上层错误信息，以免把渠道原文写进日志或接口
func doRequest(ctx context.Context, method, endpoint string, header http.Header, body []byte) ([]byte, error) {
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, fmt.Errorf("支付请求构造失败")
	}
	for key, values := range header {
		for _, v := range values {
			req.Header.Add(key, v)
		}
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("支付渠道网络请求失败")
	}
	defer res.Body.Close()
	raw, err := ioutil.ReadAll(io.LimitReader(res.Body, responseLimit))
	if err != nil {
		return nil, fmt.Errorf("支付渠道响应读取失败")
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fmt.Errorf("支付渠道返回异常状态")
	}
	return raw, nil
}

// nonce 渠道请求的随机串
func nonce() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return fmt.Sprintf("%x", buf)
}

// NotifyAck 回调处理完后必须回给渠道的应答
// 支付宝看响应文本 success 才停止重试，微信看 HTTP 2xx + code=SUCCESS；
// 处理失败时要显式回非成功，让渠道按各自策略重投，不能吞掉
func NotifyAck(provider string, handleErr error) (status int, contentType, body string) {
	switch provider {
	case "wechat":
		if handleErr != nil {
			return http.StatusServiceUnavailable, "application/json", `{"code":"FAIL","message":"处理失败"}`
		}
		return http.StatusOK, "application/json", `{"code":"SUCCESS","message":"成功"}`
	default:
		if handleErr != nil {
			return http.StatusBadRequest, "text/plain", "failure"
		}
		return http.StatusOK, "text/plain", "success"
	}
}
