// models 数据模型模块
// miniprogram.go 小程序授权登录入参
// 出参复用 models.LoginResponse，与 POST /api/login 结构一致，客户端不需要为小程序另写一套分支
package models

// MpWechatLoginRequest POST /api/miniprogram/wechat/login 入参
// Code 是 wx.login 返回的一次性凭证，服务端拿它换 openid；
// PhoneCode 是手机号快捷授权返回的 code，缺省时只完成静默身份换取、不发令牌
type MpWechatLoginRequest struct {
	Code      string `json:"code" binding:"required"`
	PhoneCode string `json:"phone_code"`
}

// MpBindRequest POST /api/miniprogram/bind 入参
// 只接受平台凭证：openid 由服务端用 code 重新换取，绝不接收客户端自报的 openid，
// 否则等于允许调用方把别人的收款身份挂到自己账号上
type MpBindRequest struct {
	Code string `json:"code" binding:"required"`
}
