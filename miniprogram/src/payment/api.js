// 支付模块接口层：只打 /api/payment/*，与商城接口层分开维护
// 移植自 frontend/src/payment/api.js，与 H5 同一口径：prepay 建单 → launch 拿指令 → 轮询取结果
// 小程序比 H5 多一个 mockConfirm：小程序没有整页跳转，模拟渠道的「渠道侧收款动作」只能由前端补一次触发
import request from '../utils/request'

/** 建支付单：order_id + provider(alipay|wechat)，返回支付单 */
export function prepay({ orderId, provider }) {
  return request.post('/payment/prepay', { order_id: orderId, provider })
}

/** 支付单查询：前端轮询用，超时单在后端惰性置 closed */
export function queryPayment(id) {
  return request.get(`/payment/query/${encodeURIComponent(id)}`)
}

/**
 * 小程序收银台：先唤起，再按返回的形态决定留在本页轮询还是跳走。
 * outcome 仅模拟渠道用，真实渠道下由服务端忽略。
 */
export function launchPayment(id, outcome = 'success') {
  return request.post(`/payment/launch/${encodeURIComponent(id)}`, { outcome })
}

/** 模拟渠道的收款结果确认：走后端既有的回调入口，状态机与真实渠道一字不差 */
export function mockConfirm(id, outcome) {
  return request.post(`/payment/mock-notify/${encodeURIComponent(id)}`, { outcome })
}

/** 是否模拟支付单：服务端只在 mock 渠道下回填 mock_credential，真实渠道恒为空 */
export function isMockPayment(payment) {
  return Boolean(payment && payment.mock_credential)
}
