// controllers 控制层
// payment_module.go 支付模块接线
// 支付的路由、渠道适配与状态机全部在 go-gin/payment 内，控制器只负责把订单适配器与
// 会员解析注进去，再让模块自己注册路由——换商城或换端都不用改支付代码
package controllers

import (
	"go-gin/payment"
	"go-gin/services"
)

// NewPaymentModule 组装支付模块
func NewPaymentModule() *payment.Module {
	return payment.NewModule(services.NewPaymentGateway(), MemberID)
}
