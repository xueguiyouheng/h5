import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { checkoutPreview, createOrder, fetchAddresses, fetchCart, moneyLabel } from '../../api'
import { PROVIDERS, PaymentSheet, prepay } from '../../payment'
import { readPickedAddress } from '../address/pick'
import './index.scss'

/**
 * 结算页：地址 → 渠道 → 试算 → 下单 → 收银台
 * 金额一律取服务端试算结果，端上不加价。下单会清空购物车行、试算随之失去入参，
 * 因此存下用户确认过的那份，续付期间页面不会变空壳（与 H5 同一处理）
 */
export default function Checkout() {
  // 详情页「立即购买」带着行 id 进来：只结算这几行，不受购物车既有勾选影响
  const onlyItemIds = (useRouter().params.items || '').split(',').filter(Boolean)
  const [items, setItems] = useState([])
  const [currency, setCurrency] = useState('USD')
  const [addresses, setAddresses] = useState([])
  const [addressId, setAddressId] = useState('')
  const [preview, setPreview] = useState(null)
  const [provider, setProvider] = useState(PROVIDERS[0] ? PROVIDERS[0].id : '')
  const [order, setOrder] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [pay, setPay] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [canceled, setCanceled] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [orderError, setOrderError] = useState('')

  const selectedIds = items.filter((i) => i.selected).map((i) => i.id)
  const selection = selectedIds.join(',')

  // 首屏取购物车与地址簿；之后再显示只接地址页写下的选择，不把两个接口重打一遍
  const firstShow = useRef(true)
  useDidShow(async () => {
    const picked = readPickedAddress()
    if (picked) setAddressId(picked)
    if (!firstShow.current) return
    firstShow.current = false
    try {
      const [cart, addr] = await Promise.all([fetchCart(), fetchAddresses()])
      setItems(
        onlyItemIds.length
          ? cart.items.map((i) => ({ ...i, selected: onlyItemIds.includes(i.id) }))
          : cart.items,
      )
      setCurrency(cart.currency)
      setAddresses(addr.list)
      // prev 非空说明用户刚在地址页选过，显式选择优先于默认地址
      setAddressId((prev) => prev || addr.defaultId || (addr.list[0] && addr.list[0].id) || '')
      setLoadError('')
    } catch (err) {
      setLoadError((err && err.message) || '结算信息加载失败')
    }
  })

  // 地址与勾选集合任一变化都会改运费与应付；勾选集合每次渲染都是新数组，拼成串才能当依赖
  useEffect(() => {
    if (!selection) {
      setPreview(null)
      return undefined
    }
    let cancelled = false
    checkoutPreview({ address_id: addressId, item_ids: selection.split(',') })
      .then((doc) => {
        if (!cancelled) {
          setPreview(doc)
          setLoadError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError((err && err.message) || '试算失败')
      })
    return () => {
      cancelled = true
    }
  }, [selection, addressId])

  const summary = preview || (order ? snapshot : null)
  const address = (summary && summary.address) || addresses.find((a) => a.id === addressId) || null
  const payable = summary ? moneyLabel(summary.payable.toFixed(2), currency) : '--'

  // 小程序收银台不会跳走，成功与失败都换到结果页由它继续轮询；只有取消留在本页给续付入口
  function onPayResult(outcome) {
    const current = pay
    setPay(null)
    if (outcome === 'cancel') {
      setCanceled(true)
      return
    }
    if (!current) return
    Taro.redirectTo({
      url: `/pages/payment-result/index?payment_id=${encodeURIComponent(current.payment.id)}&order_id=${encodeURIComponent(current.order.id)}`,
    })
  }

  // 已持有订单时不二次下单：库存与券在下单时已经占用过了
  async function submit() {
    if (placing) return
    if (!address) {
      Taro.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }
    setPlacing(true)
    setOrderError('')
    try {
      let placed = order
      if (!placed) {
        setSnapshot(preview)
        placed = await createOrder({ address_id: address.id, item_ids: selectedIds, payment_method: provider })
        setOrder(placed)
      }
      setCanceled(false)
      const doc = await prepay({ orderId: placed.id, provider })
      setPay({ order: placed, payment: doc })
    } catch (err) {
      setOrderError((err && err.message) || '下单失败')
    } finally {
      setPlacing(false)
    }
  }

  if (!selectedIds.length && !order && !placing) {
    return (
      <View className="checkout">
        <Text className="tip">{loadError || '购物车里没有勾选商品'}</Text>
        <Text className="tip__action" onClick={() => Taro.switchTab({ url: '/pages/cart/index' })}>
          回购物车勾选
        </Text>
      </View>
    )
  }

  return (
    <View className="checkout">
      <View className="block">
        <View className="block__head">
          <Text className="block__title">收货地址</Text>
          <Text className="block__action" onClick={() => Taro.navigateTo({ url: '/pages/address/index?pick=1' })}>
            {address ? '更换' : '添加地址'}
          </Text>
        </View>
        {address ? (
          <View className="addr">
            <Text className="addr__label">{address.label}</Text>
            <Text className="addr__detail">{address.detail}</Text>
          </View>
        ) : (
          <Text className="addr__empty">{loadError || '还没有收货地址，先加一条才能下单'}</Text>
        )}
      </View>

      <View className="block">
        <Text className="block__title">支付方式</Text>
        <View className="ways">
          {PROVIDERS.map((option) => (
            <View
              className={`way ${option.id === provider ? 'way--on' : ''}`}
              key={option.id}
              onClick={() => setProvider(option.id)}
            >
              <View className={`check ${option.id === provider ? 'check--on' : ''}`} />
              <Text className="way__label">{option.label}</Text>
              <Text className={`pay-mark ${option.markClass}`}>{option.mark}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="block">
        <Text className="block__title">金额</Text>
        {!summary ? (
          <View className="sum__empty">
            <Text className="sk sk--line w-60" />
            <Text className="sk sk--line w-40" />
          </View>
        ) : (
          <View>
            <View className="sum__row">
              <Text className="sum__label">商品小计</Text>
              <Text className="sum__value">{moneyLabel(summary.subtotal.toFixed(2), currency)}</Text>
            </View>
            <View className="sum__row">
              <Text className="sum__label">配送费</Text>
              <Text className="sum__value">{moneyLabel(summary.deliveryFee.toFixed(2), currency)}</Text>
            </View>
            {summary.discount > 0 ? (
              <View className="sum__row">
                <Text className="sum__label">优惠</Text>
                <Text className="sum__value sum__value--cut">-{moneyLabel(summary.discount.toFixed(2), currency)}</Text>
              </View>
            ) : null}
            <Text className="sum__hint">
              {summary.deliveryFee === 0
                ? '本次订单免运费'
                : `满 ${moneyLabel(summary.freeDeliveryThreshold.toFixed(2), currency)} 免运费`}
            </Text>
          </View>
        )}
      </View>

      <View className="total">
        <Text className="total__label">应付</Text>
        <Text className="total__value">{payable}</Text>
      </View>

      {orderError ? <Text className="checkout__error">{orderError}</Text> : null}

      {canceled && order ? (
        <Text className="checkout__hold">订单 {order.order_no} 已创建、尚未支付，可继续支付或稍后在订单页处理</Text>
      ) : null}

      <Text className={`btn checkout__submit ${placing ? 'btn--dim' : ''}`} onClick={submit}>
        {placing ? '提交中...' : order ? '继续支付' : `去支付 · ${payable}`}
      </Text>
      <Text className="checkout__terms">提交订单即表示同意服务条款与配送约定</Text>

      {pay ? <PaymentSheet payment={pay.payment} onResult={onPayResult} /> : null}
    </View>
  )
}
