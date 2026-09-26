import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { fetchNearbyStores } from '../../api'
import { locate, switchStore } from '../../utils/shop'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import './index.scss'

const HINT_DENIED = '没有拿到定位权限，列表按门店创建顺序展示'
const HINT_OK = '已按距离排序'

/**
 * 附近门店 / 切店：门店决定商品、购物车与订单的归属
 * 换店成功后整端重进首页——留着上一家店的列表只会让人下错单
 */
export default function Stores() {
  const [stores, setStores] = useState([])
  const [located, setLocated] = useState(false)
  const [coords, setCoords] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState(null)
  const firstShow = useRef(true)

  async function load(withLocation) {
    const point = withLocation ? await locate() : coords
    if (withLocation) setCoords(point)
    try {
      const data = await fetchNearbyStores(point || {})
      setStores(data.list || [])
      setLocated(data.located)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    const first = firstShow.current
    firstShow.current = false
    load(first)
  })

  async function choose(store) {
    if (pendingId || store.current) return
    setPendingId(store.id)
    try {
      const selected = await switchStore(store.id, coords)
      Taro.showToast({ title: `已切到 ${selected.name}`, icon: 'none' })
      setTimeout(() => Taro.reLaunch({ url: '/pages/home/index' }), 700)
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '切换失败', icon: 'none' })
      setPendingId('')
    }
  }

  if (error instanceof NeedsPhoneAuth) {
    return (
      <View className="page">
        <Text className="tip">先登录，才能按你的位置排门店</Text>
        <Text className="tip__action" onClick={gotoLogin}>
          去登录
        </Text>
      </View>
    )
  }

  if (loading && !stores.length) {
    return (
      <View className="stores">
        <View className="sk sk--store" />
        <View className="sk sk--store" />
      </View>
    )
  }

  // 屏上还有门店就不整页报错：刷新失败留着旧列表，下拉或重进本页即重试
  if (error && !stores.length) {
    return (
      <View className="stores">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={() => load(true)}>
          重新加载
        </Text>
      </View>
    )
  }

  return (
    <View className="stores">
      <Text className="stores__hint">{located ? HINT_OK : HINT_DENIED}</Text>
      {!located ? (
        <Text className="stores__relocate" onClick={() => load(true)}>
          按定位重新排序
        </Text>
      ) : null}

      {stores.map((store) => (
        <View
          className={`store ${store.current ? 'store--on' : ''}`}
          key={store.id}
          onClick={() => choose(store)}
        >
          <View className="store__main">
            <Text className="store__name">
              {store.name}
              {store.current ? <Text className="store__chip">当前门店</Text> : null}
            </Text>
            <Text className="store__addr">
              {store.address || '该门店未填地址'}
              {store.outOfRange ? ' · 超出配送范围' : ''}
            </Text>
            {store.notice ? <Text className="store__notice">{store.notice}</Text> : null}
            {store.minOrderAmount > 0 ? (
              <Text className="store__min">起送 ${store.minOrderAmount.toFixed(2)}</Text>
            ) : null}
          </View>
          <Text className="store__side">
            {pendingId === store.id ? '切换中' : store.distanceText || (store.status === 'open' ? '营业中' : '休息中')}
          </Text>
        </View>
      ))}

      {!stores.length ? <Text className="tip">这家门店列表还是空的</Text> : null}
    </View>
  )
}
