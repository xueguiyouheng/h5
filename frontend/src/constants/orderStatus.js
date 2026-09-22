// 订单状态是接口返回的枚举键，这里只做展示层的文案与图标映射
import iconAccepted from '../assets/orders/icon-accepted.svg'
import iconCancelled from '../assets/orders/icon-cancelled.svg'

export const ORDER_STATUS_META = {
  ready: { label: 'Ready to collect', icon: 'dot' },
  accepted: { label: 'Order accepted', icon: iconAccepted },
  delivered: { label: 'Order delivered', icon: iconAccepted },
  cancelled: { label: 'Order cancelled', icon: iconCancelled },
}
