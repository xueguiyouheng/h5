// 订单状态是服务端返回的枚举键，这里只做展示层文案，端上不参与状态判定
// 文案口径来自 H5 的 constants/orderStatus.js（那边用英文标签，小程序面向同一批买家改为中文）
export const ORDER_STATUS_LABEL = {
  accepted: '商家已接单',
  ready: '备货完成待取',
  delivered: '已送达',
  cancelled: '已取消',
}

export const PAYMENT_STATUS_LABEL = {
  unpaid: '未支付',
  paid: '已支付',
  failed: '支付失败',
}

// 轨迹节点的标签由服务端下发（英文），这里只补状态本身缺的中文名
export function statusLabel(status) {
  return ORDER_STATUS_LABEL[status] || status || ''
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABEL[status] || ''
}

/** 待支付的订单才给续付入口；已取消与已送达都不该再出现支付按钮 */
export function canPayOrder(order) {
  return Boolean(order) && order.status !== 'cancelled' && order.payment_status !== 'paid'
}
