// payment 支付模块
// errors.go 模块自有错误类型：不回依赖 services.APIError，由本包 http.go 直接映射为响应信封
package payment

import "fmt"

// Error 带 HTTP 状态码的业务错误
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

// newError 构造业务错误
func newError(status int, format string, args ...interface{}) error {
	return &Error{Status: status, Message: fmt.Sprintf(format, args...)}
}

// ErrNotFound 资源不存在
func ErrNotFound(msg string) error { return newError(404, "%s", msg) }

// ErrBadRequest 参数校验失败
func ErrBadRequest(msg string) error { return newError(400, "%s", msg) }

// ErrConflict 唯一约束或状态冲突
func ErrConflict(msg string) error { return newError(409, "%s", msg) }

// ErrUnprocessable 业务规则不满足
func ErrUnprocessable(msg string) error { return newError(422, "%s", msg) }

// ErrStoreOff 数据层未就绪
var ErrStoreOff = newError(500, "服务暂不可用")

// StatusOf 取错误的 HTTP 状态码与文案，非本模块错误统一按 500 处理，
// 渠道原文与内部实现细节都不借响应体外泄
func StatusOf(err error) (int, string) {
	if e, ok := err.(*Error); ok {
		return e.Status, e.Message
	}
	return 500, "服务暂不可用"
}
