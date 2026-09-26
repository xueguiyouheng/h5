import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import useRequest from '../../hooks/useRequest'
import { cancelOrder, fetchOrderDetail, formatOrderDate, moneyLabel } from '../../api'
import { PROVIDERS, PaymentSheet, prepay } from '../../payment'
import { canPayOrder, paymentStatusLabel, statusLabel } from '../../constants/orderStatus'
import './index.scss'

/**
 * 订单详情：状态、轨迹、金额快照与两条出路（取消 / 续付）
 * 支付这一环与结算页共用同一模块——prepay 建单、PaymentSheet 唤起、结果交结果页轮询
 */
export default function OrderDetail() {
  const router = useRouter()
  const id = router.params.id || ''
  const { data: order, loading, error, refresh } = useRequest(() => fetchOrderDetail(id), { skip: !id })
  const [pay, setPay] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState('')

  if (!id) {
    return (
      <View className="page">
        <Text className="tip">链接里没有订单编号</Text>
      </View>
    )
  }

  if (loading && !order) {
    return (
      <View className="page">
        <View className="sk sk--line w-60" />
        <View className="sk sk--block" />
        <View className="sk sk--block" />
      </View>
    )
  }

  // 订单已经在屏上就不整页报错：刷新失败留着上一次的内容，重进本页即重试
  if (error && !order) {
    return (
      <View className="page">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={refresh}>
          重新加载
        </Text>
      </View>
    )
  }

  // 渠道按端裁剪：微信小程序里不给支付宝建单，否则必然在唤起那一步失败
  const provider = PROVIDERS.some((p) => p.id === order.payment_method)
    ? order.payment_method
    : PROVIDERS[0] && PROVIDERS[0].id
  // 取消与续付同属「未支付且未取消」这一档，服务端也是按这个条件放行
  const actionable = canPayOrder(order)

  async function onPayResult(outcome) {
    const current = pay
    setPay(null)
    if (outcome === 'cancel') return
    if (!current) return
    Taro.redirectTo({
      url: `/pages/payment-result/index?payment_id=${encodeURIComponent(current.payment.id)}&order_id=${encodeURIComponent(current.order.id)}`,
    })
  }

  // 已有支付单时不重复建单：prepay 对同一订单二次下单会被服务端拒（409）
  async function goPay() {
    if (busy) return
    setBusy(true)
    setTip('')
    try {
      const doc = await prepay({ orderId: order.id, provider })
      setPay({ order, payment: doc })
    } catch (err) {
      setTip(err.message || '发起支付失败')
    } finally {
      setBusy(false)
    }
  }

  async function onCancel() {
    if (busy) return
    const confirmed = await Taro.showModal({ title: '取消订单', content: '取消后库存会退回，本次优惠不再保留' })
    if (!confirmed.confirm) return
    setBusy(true)
    setTip('')
    try {
      await cancelOrder(order.id)
      await refresh()
    } catch (err) {
      setTip(err.message || '取消失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="detail">
      <View className="state">
        <Text className="state__title">{statusLabel(order.status)}</Text>
        <Text className="state__sub">
          {order.order_no} · {order.date}
        </Text>
        <Text className={`state__pay state__pay--${actionable ? 'wait' : 'ok'}`}>
          {paymentStatusLabel(order.payment_status) || '未支付'}
        </Text>
      </View>

      {(order.steps || []).length > 0 && (
        <View className="track">
          {order.steps.map((step) => (
            <View className={`track__step ${step.done ? 'track__step--done' : ''}`} key={step.code}>
              <View className="track__dot" />
              <Text className="track__label">{step.label}</Text>
              <Text className="track__at">{step.at ? formatOrderDate(step.at) : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <View className="block">
        <Text className="block__title">收货信息</Text>
        <View className="addr">
          <Text className="addr__label">
            {order.receiver || order.address}
            {order.receiver_phone ? ` · ${order.receiver_phone}` : ''}
          </Text>
          <Text className="addr__detail">{order.address_detail || order.address}</Text>
          {order.store_name ? <Text className="addr__detail">配送门店：{order.store_name}</Text> : null}
        </View>
        {order.eta ? <Text className="block__foot">预计送达 {order.eta}</Text> : null}
      </View>

      <View className="block">
        <Text className="block__title">商品</Text>
        {(order.items || []).map((item) => (
          <View className="item" key={item.id}>
            <Image className="item__img" src={item.image} mode="aspectFit" />
            <View className="item__main">
              <Text className="item__name">{item.name}</Text>
              <Text className="item__qty">
                {moneyLabel(item.unitPrice.toFixed(2), order.currency)} × {item.qty}
              </Text>
            </View>
            <Text className="item__total">{moneyLabel(item.lineTotal.toFixed(2), order.currency)}</Text>
          </View>
        ))}
      </View>

      <View className="block">
        <View className="sum__row">
          <Text className="sum__label">商品小计</Text>
          <Text className="sum__value">{moneyLabel(order.subtotalValue.toFixed(2), order.currency)}</Text>
        </View>
        <View className="sum__row">
          <Text className="sum__label">配送费</Text>
          <Text className="sum__value">{moneyLabel(order.deliveryFeeValue.toFixed(2), order.currency)}</Text>
        </View>
        {order.discountValue > 0 ? (
          <View className="sum__row">
            <Text className="sum__label">优惠</Text>
            <Text className="sum__value sum__value--cut">-{moneyLabel(order.discountValue.toFixed(2), order.currency)}</Text>
          </View>
        ) : null}
        <View className="total">
          <Text className="total__label">实付</Text>
          <Text className="total__value">{moneyLabel(order.total.toFixed(2), order.currency)}</Text>
        </View>
      </View>

      {order.remark ? (
        <View className="block">
          <Text className="block__title">备注</Text>
          <Text className="block__foot">{order.remark}</Text>
        </View>
      ) : null}

      {tip ? <Text className="detail__error">{tip}</Text> : null}

      <View className="actions">
        {actionable ? (
          <Text className={`btn btn--ghost actions__btn ${busy ? 'btn--dim' : ''}`} onClick={onCancel}>
            取消订单
          </Text>
        ) : null}
        {actionable ? (
          <Text className={`btn actions__btn ${busy ? 'btn--dim' : ''}`} onClick={goPay}>
            去支付 · {moneyLabel(order.total.toFixed(2), order.currency)}
          </Text>
        ) : null}
        <Text className="btn btn--text actions__btn" onClick={refresh}>
          刷新状态
        </Text>
      </View>

      {pay ? <PaymentSheet payment={pay.payment} onResult={onPayResult} /> : null}
    </View>
  )
}
