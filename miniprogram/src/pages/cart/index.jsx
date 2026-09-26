import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import { fetchCart, setCartItemQty, removeCartItem, selectCartItems, moneyLabel } from '../../api'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import './index.scss'

/**
 * 购物车：勾选、改量、删除全部走服务端，本页不留本地副本
 * 每次写操作都回整套合计（subtotal / delivery_fee / payable），端上不参与金额裁决
 */
export default function Cart() {
  const [cart, setCart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async (opts = {}) => {
    try {
      const data = await fetchCart()
      setCart(data)
      setError(null)
    } catch (err) {
      if (opts.silent) return
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  // tab 页每次显示都重取：详情/收藏页加购之后回到本页要能看到新行
  const firstShow = useRef(true)
  useDidShow(() => {
    const silent = !firstShow.current
    firstShow.current = false
    load({ silent })
  })

  async function mutate(fn) {
    if (busy) return
    setBusy(true)
    try {
      const data = await fn()
      if (data && data.items) setCart(data)
      else await load({ silent: true })
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  if (error instanceof NeedsPhoneAuth) {
    return (
      <View className="cart">
        <Text className="tip">先登录，购物车才会和网页端在同一个账号下</Text>
        <Text className="tip__action" onClick={gotoLogin}>
          去登录
        </Text>
      </View>
    )
  }

  if (loading && !cart) {
    return (
      <View className="cart">
        <View className="sk-row">
          <View className="sk sk--row" />
          <View className="sk sk--row" />
        </View>
      </View>
    )
  }

  // 购物车已经在屏上就不整页报错：回到本页刷新失败留着旧车继续结算，下拉/重进即重试
  if (error && !cart) {
    return (
      <View className="cart">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={load}>
          重新加载
        </Text>
      </View>
    )
  }

  const items = (cart && cart.items) || []
  const selected = items.filter((i) => i.selected)
  const allSelected = items.length > 0 && selected.length === items.length

  // 勾选是「以这份集合为准」的覆盖式写入，端上必须算出勾选后的完整集合再发
  const toggleItem = (item) => {
    const ids = items.filter((i) => i.selected).map((i) => i.id)
    const next = item.selected ? ids.filter((id) => id !== item.id) : ids.concat([item.id])
    return mutate(() => selectCartItems({ all: false, item_ids: next }))
  }

  if (items.length === 0) {
    return (
      <View className="cart">
        <Text className="tip">购物车还是空的</Text>
        <Text className="tip__action" onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          去逛逛
        </Text>
      </View>
    )
  }

  return (
    <View className="cart">
      {items.map((item) => (
        <View className="row" key={item.id}>
          <View
            className={`check ${item.selected ? 'check--on' : ''}`}
            onClick={() => toggleItem(item)}
          />
          <Image className="row__img" src={item.image} mode="aspectFit" />
          <View className="row__main">
            <Text className="row__name">{item.name}</Text>
            <Text className="row__price">{item.price}</Text>
            <Text className="row__sub">小计 {moneyLabel((item.priceValue * item.qty).toFixed(2), cart.currency)}</Text>
          </View>
          <View className="stepper">
            <Text
              className={`stepper__btn ${item.qty <= 1 ? 'stepper__btn--dim' : ''}`}
              onClick={() => mutate(() => (item.qty <= 1 ? removeCartItem(item.id) : setCartItemQty(item.id, item.qty - 1)))}
            >
              －
            </Text>
            <Text className="stepper__num">{item.qty}</Text>
            <Text
              className="stepper__btn"
              onClick={() => {
                // 上限按可购数量收，超过会被服务端拒（maxQty 含门店库存与限购）
                if (item.qty >= item.maxQty) {
                  Taro.showToast({ title: `最多还能买 ${item.maxQty} 件`, icon: 'none' })
                  return
                }
                mutate(() => setCartItemQty(item.id, item.qty + 1))
              }}
            >
              ＋
            </Text>
          </View>
        </View>
      ))}

      <View className="bar">
        <View
          className={`check ${allSelected ? 'check--on' : ''}`}
          onClick={() => mutate(() => selectCartItems({ all: !allSelected }))}
        />
        <Text className="bar__all" onClick={() => mutate(() => selectCartItems({ all: !allSelected }))}>
          全选（{items.length} 件）
        </Text>
        <Text className="bar__total">
          合计 {moneyLabel(cart.payable.toFixed(2), cart.currency)}
        </Text>
      </View>

      <View className="checkout">
        {cart.deliveryFee > 0 && selected.length > 0 ? (
          <Text className="checkout__fee">含运费 {moneyLabel(cart.deliveryFee.toFixed(2), cart.currency)}</Text>
        ) : null}
        <Text
          className={`btn ${selected.length === 0 || busy ? 'btn--dim' : ''}`}
          onClick={() => {
            if (selected.length === 0) {
              Taro.showToast({ title: '请先勾选商品', icon: 'none' })
              return
            }
            Taro.navigateTo({ url: '/pages/checkout/index' })
          }}
        >
          {selected.length > 0 ? `去结算 · ${moneyLabel(cart.payable.toFixed(2), cart.currency)}` : '去结算'}
        </Text>
      </View>
    </View>
  )
}
