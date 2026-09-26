import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import { fetchOrders, moneyLabel } from '../../api'
import { paymentStatusLabel, statusLabel } from '../../constants/orderStatus'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import './index.scss'

const PAGE_SIZE = 6

const TABS = [
  { key: 'ongoing', label: '进行中' },
  { key: 'history', label: '已完单' },
]

const EMPTY = { list: [], page: 0, total: 0, hasMore: false }

/**
 * 订单列表：切 tab 与翻页都保留上一批内容，新数据到了才换
 * 整片闪白是 H5 那版踩过的坑，小程序同样靠「不清空 + 压暗」解决
 */
export default function Orders() {
  const [tab, setTab] = useState('ongoing')
  const [feed, setFeed] = useState(EMPTY)
  const [switching, setSwitching] = useState(false)
  const [dim, setDim] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [error, setError] = useState(null)
  const seq = useRef(0)
  const busyRef = useRef(false)
  const firstShow = useRef(true)

  // silent：回页时的静默刷新，旧内容原样留着，不压暗也不出骨架屏
  async function load(nextTab, page, append, silent = false) {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1
    const callId = seq.current
    if (append) setFeeding(true)
    else {
      setSwitching(true)
      setDim(!silent)
    }
    try {
      const res = await fetchOrders({ tab: nextTab, page, pageSize: PAGE_SIZE })
      if (seq.current !== callId) return
      setFeed((prev) =>
        append
          ? { list: prev.list.concat(res.list), page: res.page, total: res.total, hasMore: res.hasMore }
          : { list: res.list, page: res.page, total: res.total, hasMore: res.hasMore },
      )
      if (!append) setTab(nextTab)
      setError(null)
    } catch (err) {
      if (seq.current === callId) setError(err)
    } finally {
      if (seq.current === callId) {
        setSwitching(false)
        setFeeding(false)
        setDim(false)
      }
      busyRef.current = false
    }
  }

  // 支付或取消之后回到本页：首屏要骨架，静默回页只换数据、不闪骨架屏
  useDidShow(() => {
    const silent = !firstShow.current
    firstShow.current = false
    load(tab, 1, false, silent)
  })

  useReachBottom(() => {
    if (feed.hasMore && !switching) load(tab, feed.page + 1, true)
  })

  usePullDownRefresh(async () => {
    await load(tab, 1, false)
    Taro.stopPullDownRefresh()
  })

  if (error instanceof NeedsPhoneAuth) {
    return (
      <View className="orders">
        <Text className="tip">先登录，订单才会归到同一个账号下</Text>
        <Text className="tip__action" onClick={gotoLogin}>
          去登录
        </Text>
      </View>
    )
  }

  if (error && !feed.list.length) {
    return (
      <View className="orders">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={() => load(tab, 1, false)}>
          重新加载
        </Text>
      </View>
    )
  }

  return (
    <View className="orders">
      <View className="tabs">
        {TABS.map((item) => (
          <Text
            key={item.key}
            className={`tabs__item ${item.key === tab ? 'tabs__item--on' : ''}`}
            onClick={() => {
              if (item.key !== tab) load(item.key, 1, false)
            }}
          >
            {item.label}
          </Text>
        ))}
        <Text className="tabs__count">{feed.total} 单</Text>
      </View>

      {switching && !feed.list.length ? (
        <View className="orders__sk">
          <View className="sk sk--order" />
          <View className="sk sk--order" />
        </View>
      ) : null}

      {!feed.list.length && !switching ? (
        <Text className="tip">{tab === 'ongoing' ? '暂无进行中的订单' : '暂无历史订单'}</Text>
      ) : null}

      <View className={`orders__list ${dim ? 'orders__list--dim' : ''}`}>
        {feed.list.map((order) => (
          <View
            className="order"
            key={order.id}
            onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(order.id)}` })}
          >
            <View className="order__head">
              <Text className="order__no">{order.order_no}</Text>
              <Text className="order__state">{statusLabel(order.status)}</Text>
            </View>
            <View className="order__meta">
              <Text className="order__date">{order.date}</Text>
              <Text className={`order__pay order__pay--${order.payment_status === 'paid' ? 'ok' : 'wait'}`}>
                {paymentStatusLabel(order.payment_status) || '未支付'}
              </Text>
            </View>
            <View className="order__goods">
              {(order.items || []).slice(0, 3).map((item) => (
                <Image className="order__img" key={item.id} src={item.image} mode="aspectFill" />
              ))}
              <View className="order__sum">
                <Text className="order__count">{(order.items || []).length} 件商品</Text>
                <Text className="order__total">{moneyLabel(order.total.toFixed(2), order.currency)}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {feeding ? <Text className="orders__more">加载中...</Text> : null}
      {!feed.hasMore && feed.list.length && !feeding ? <Text className="orders__more">没有更多了</Text> : null}
    </View>
  )
}
