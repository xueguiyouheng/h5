// constants/adminOrder.js 中台订单处理的展示与校验常量
// NEXT_STATUS 必须与后端 services/admin_order.go 的 adminOrderFlow 保持一致

export const ORDER_NEXT_STATUS = {
  accepted: ['ready', 'delivered'],
  ready: ['accepted', 'delivered'],
  delivered: [],
  cancelled: [],
}

export const ORDER_STATUS_ACTION_LABEL = {
  accepted: '退回待备货',
  ready: '备货完成',
  delivered: '确认送达',
}
