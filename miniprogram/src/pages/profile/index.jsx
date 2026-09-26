import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import { fetchNearbyStores, fetchProfile } from '../../api'
import { signOut } from '../../utils/auth'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import './index.scss'

/** 手机号中间四位打码展示：账号是合并主键，屏幕上不留完整号码 */
function maskMobile(mobile) {
  const value = String(mobile || '')
  if (value.length !== 11) return value || '未绑定手机号'
  return `${value.slice(0, 3)}****${value.slice(7)}`
}

/**
 * 我的：账号身份 + 三条出路（订单 / 地址 / 门店）
 * 每次显示都重取，支付或改地址之后回到本页数据就是新的
 */
export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const firstShow = useRef(true)

  async function load(silent) {
    try {
      const [me, stores] = await Promise.all([fetchProfile(), fetchNearbyStores({})])
      setProfile(me)
      const current = (stores.list || []).find((item) => item.current) || null
      setStoreName(current ? current.name : '')
      setError(null)
    } catch (err) {
      // 静默刷新失败留着旧数据，不给已经打开的页面盖一层错误
      if (!silent) setError(err)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    const silent = !firstShow.current
    firstShow.current = false
    load(silent)
  })

  function signOutAndHome() {
    signOut()
    // 回登录页而不是首页：没身份的人留在带 tabBar 的商城屏上只会看到一屏空
    Taro.reLaunch({ url: '/pages/login/index' })
  }

  if (error instanceof NeedsPhoneAuth) {
    return (
      <View className="page">
        <Text className="tip">这个微信还没登录过，先登录才能看到你的账号</Text>
        <Text className="tip__action" onClick={gotoLogin}>
          去登录
        </Text>
      </View>
    )
  }

  if (loading && !profile) {
    return (
      <View className="page">
        <View className="sk sk--profile" />
        <View className="sk sk--line w-40" />
      </View>
    )
  }

  // 账号信息已经在屏上就不整页报错：切回「我的」刷新失败留着旧资料继续用，重进本页即重试
  if (error && !profile) {
    return (
      <View className="page">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={() => load(false)}>
          重新加载
        </Text>
      </View>
    )
  }

  const entries = [
    { key: 'orders', label: '我的订单', value: '进行中与历史', action: () => Taro.switchTab({ url: '/pages/orders/index' }) },
    { key: 'favorites', label: '我的收藏', value: '一键加入购物车', action: () => Taro.navigateTo({ url: '/pages/favorites/index' }) },
    { key: 'address', label: '收货地址', value: storeName ? `配送门店：${storeName}` : '结算时使用默认地址', action: () => Taro.navigateTo({ url: '/pages/address/index' }) },
    { key: 'stores', label: '附近门店', value: storeName || '按定位取最近', action: () => Taro.navigateTo({ url: '/pages/stores/index' }) },
  ]

  return (
    <View className="me">
      <View className="me__head">
        {profile.avatar ? <Image className="me__avatar" src={profile.avatar} mode="aspectFill" /> : <View className="me__avatar me__avatar--empty" />}
        <View className="me__id">
          <Text className="me__name">{profile.username || '买家'}</Text>
          <Text className="me__mobile">{maskMobile(profile.mobile)}</Text>
        </View>
        {profile.isAdmin ? <Text className="me__badge">商家账号</Text> : null}
      </View>

      <View className="me__menu">
        {entries.map((entry) => (
          <View className="row" key={entry.key} onClick={entry.action}>
            <Text className="row__label">{entry.label}</Text>
            <Text className="row__value">{entry.value}</Text>
            <Text className="row__arrow">›</Text>
          </View>
        ))}
      </View>

      <Text className="me__signout" onClick={signOutAndHome}>
        退出登录
      </Text>
      <Text className="me__foot">
        账号与网页端同一个：购物车、地址与订单在两端共用。商家发品与订单处理仍在网页端中台，小程序即将开放
      </Text>
    </View>
  )
}
