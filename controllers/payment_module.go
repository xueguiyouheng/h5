// controllers 控制层
// payment_module.go 支付模块接线
// 支付的路由、渠道适配与状态机全部在 go-gin/payment 内，控制器只负责把订单适配器与
// 会员解析注进去，再让模块自己注册路由——换商城或换端都不用改支付代码
package controllers

import (
	"errors"

	"go-gin/payment"
	"go-gin/services"
)

// NewPaymentModule 组装支付模块
func NewPaymentModule() *payment.Module {
	return payment.NewModule(services.NewPaymentGateway(), MemberID, MemberPayer)
}

// MemberPayer 取该会员在各渠道的付款人标识
// openid 只认库里存的值：一旦让客户端自报，就是拿别人的身份去发起扣款
func MemberPayer(memberID string) (payment.Payer, error) {
	member, err := memberService.ByID(memberID)
	if err != nil {
		return payment.Payer{}, err
	}
	if member == nil {
		return payment.Payer{}, errors.New("付款人不存在")
	}
	return payment.Payer{WxOpenID: member.WxOpenID, AlipayUserID: member.AlipayUserID}, nil
}
