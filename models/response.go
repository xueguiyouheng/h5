// models 数据模型模块
// 定义统一的 API 响应格式，所有接口均使用此结构返回数据
package models

// ApiResponse 统一 API 响应结构
// 所有 HTTP 接口的返回数据都遵循此格式，便于前端统一处理
// Code: HTTP 状态码，Message: 提示信息，Data: 业务数据
type ApiResponse struct {
	Code    int         `json:"code"`    // HTTP 状态码
	Message string      `json:"message"` // 提示信息，如 "success" 或错误描述
	Data    interface{} `json:"data"`    // 业务数据，类型根据接口而定
}
