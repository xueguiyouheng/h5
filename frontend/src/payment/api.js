// 支付模块接口层：只打 /api/payment/*，与商城接口层分开维护
// 换端（H5 / 小程序 / App）时改的是这里和 launchers，页面不感知渠道差异
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
 * 唤起支付：换回一条 launch 指令（form / redirect / jsapi / qrcode），由 launch.js 执行。
 * outcome 只在 PAY_PROVIDER=mock 下有意义，用来指定这次模拟的收款结果；真实渠道由用户在渠道侧决定。
 */
export function launchPayment(id, outcome = 'success') {
  return request.post(`/payment/launch/${encodeURIComponent(id)}`, { outcome })
}
