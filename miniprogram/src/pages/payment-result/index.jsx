import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { moneyLabel } from '../../api'
import { usePaymentStatus } from '../../payment'
import './index.scss'

/**
 * 支付结果页：只做一件事——把支付单轮询到终态并如实展示
 * 端上从不自行判定成功，渠道弹窗点「完成」也不算；口径与 H5 的 /payment/result 一致
 */
export default function PaymentResult() {
  const router = useRouter()
  const paymentId = router.params.payment_id || ''
  const orderId = router.params.order_id || ''
  // 面板可关：关掉之后出路挪到页面按钮里，结果页不能变成死胡同
  const [dismissed, setDismissed] = useState(false)

  const { payment, error, timedOut, refresh } = usePaymentStatus(paymentId)

  const succeeded = payment && payment.status === 'success'
  // pending 期间不弹结果：回调可能晚于本页到达，提前弹会把用户吓走
  const terminal = Boolean(payment && payment.status !== 'pending') || timedOut || Boolean(error)
  const message = error
    ? error
    : timedOut || (payment && payment.status === 'closed')
      ? '支付已超时，订单未收到款项'
      : succeeded
        ? `订单 ${payment.order_no} 已完成支付`
        : '没有拿到收款结果，订单仍未支付，可稍后在订单页查看'

  if (!paymentId) {
    return (
      <View className="result">
        <Text className="tip">链接里没有支付单号，无法确认结果</Text>
        <Text className="tip__action" onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          返回商城
        </Text>
      </View>
    )
  }

  const toOrders = () =>
    orderId
      ? Taro.navigateTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(orderId)}` })
      : Taro.switchTab({ url: '/pages/orders/index' })

  return (
    <View className="result">
      <View className="result__head">
        <Text className="result__money">
          {payment ? moneyLabel(payment.amount, payment.currency) : '--'}
        </Text>
        <Text className="result__no">
          {payment ? `${payment.order_no} · ${payment.provider}` : '正在向服务端确认...'}
        </Text>
      </View>

      {!payment && !error ? (
        <View className="result__sk">
          <Text className="sk sk--line w-60" />
          <Text className="sk sk--line w-40" />
        </View>
      ) : null}

      <View className={`status status--${succeeded ? 'ok' : 'warn'}`}>
        <Text className="status__title">
          {succeeded ? '支付已完成' : terminal ? '支付未完成' : '支付结果确认中...'}
        </Text>
        {terminal ? <Text className="status__desc">{message}</Text> : null}
        {terminal && payment && payment.fail_reason ? (
          <Text className="status__raw">{payment.fail_reason}</Text>
        ) : null}
        {terminal && !dismissed ? (
          <Text className="status__close" onClick={() => setDismissed(true)}>
            关闭
          </Text>
        ) : null}
      </View>

      {terminal ? (
        <View className="result__actions">
          <Text className="btn" onClick={succeeded ? toOrders : () => Taro.switchTab({ url: '/pages/home/index' })}>
            {succeeded ? '查看我的订单' : '返回商城'}
          </Text>
          <Text className="result__link" onClick={succeeded ? () => Taro.switchTab({ url: '/pages/home/index' }) : toOrders}>
            {succeeded ? '返回商城' : '查看我的订单'}
          </Text>
        </View>
      ) : (
        <Text className="result__retry" onClick={refresh}>
          结果还没回来，点这里重新查询
        </Text>
      )}
    </View>
  )
}
