import Taro, { usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Image, Swiper, SwiperItem, ScrollView, Button } from '@tarojs/components'
import useRequest from '../../hooks/useRequest'
import ProductCard from '../../components/ProductCard'
import { fetchHome, fetchNearbyStores, fetchProducts } from '../../api'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import './index.scss'

// 首页一屏的数据来自 /shop/home 一次拉齐，猜你喜欢单独分页（与 H5 同一口径）
const PAGE_SIZE = 10

export default function Home() {
  // 门店名与首页一起取：切店后首页要显示新店，单独发一次请求会多一个闪动点
  const home = useRequest(async () => {
    const [data, stores] = await Promise.all([
      fetchHome({ recommendPageSize: PAGE_SIZE }),
      fetchNearbyStores({}).catch(() => null),
    ])
    const current = stores && (stores.list || []).find((item) => item.current)
    return { ...data, storeName: (current && current.name) || '' }
  })
  const [feed, setFeed] = useState({ list: [], page: 0, total: 0, hasMore: false })
  const [feeding, setFeeding] = useState(false)
  const loadingRef = useRef(false)

  // 首屏推荐位跟着 home 一次回来，不额外发第二次请求
  useEffect(() => {
    const page = home.data && home.data.recommend
    if (!page || loadingRef.current) return
    setFeed({ list: page.list, page: page.page, total: page.total, hasMore: page.hasMore })
  }, [home.data])

  const loadMore = async () => {
    if (loadingRef.current || !feed.hasMore) return
    loadingRef.current = true
    setFeeding(true)
    try {
      const page = await fetchProducts({ page: feed.page + 1, pageSize: PAGE_SIZE })
      setFeed((prev) => ({
        list: prev.list.concat(page.list),
        page: page.page,
        total: page.total,
        hasMore: page.hasMore,
      }))
    } catch (err) {
      Taro.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      loadingRef.current = false
      setFeeding(false)
    }
  }

  useReachBottom(() => {
    loadMore()
  })

  usePullDownRefresh(async () => {
    await Promise.all([home.refresh(), loadMore()])
    Taro.stopPullDownRefresh()
  })

  const needAuth = home.error instanceof NeedsPhoneAuth

  if (needAuth) {
    return (
      <View className="page">
        <Text className="gate__title">先登录，再看你附近的商品</Text>
        <Text className="gate__desc">
          手机号、邮箱或用户名加密码都能进，网页端的账号通用；没有账号可以在登录页注册
        </Text>
        <Button className="gate__btn" onClick={gotoLogin}>
          去登录
        </Button>
      </View>
    )
  }

  // 骨架屏只占一次位：有数据后的刷新不再整屏闪白
  if (home.loading && !home.data) {
    return (
      <View className="page">
        <View className="sk sk--banner" />
        <View className="sk-row">
          <View className="sk sk--card" />
          <View className="sk sk--card" />
        </View>
      </View>
    )
  }

  // 屏上还有内容就不整页报错：刷新失败（网络抖动、后端重启）留着旧数据，下拉刷新即重试
  if (home.error && !home.data) {
    return (
      <View className="page">
        <Text className="gate__title">{home.error.message}</Text>
        <Button className="gate__btn" onClick={home.refresh}>
          重新加载
        </Button>
      </View>
    )
  }

  const { greeting, carousel, sections, storeName } = home.data || {}
  const [first, ...rest] = sections || []

  return (
    <View className="page">
      <View className="hello">
        <Text className="hello__text">Hi, {(greeting && greeting.name) || '朋友'}</Text>
        <Text className="hello__store">{feed.total} 件在售</Text>
      </View>

      <View className="searchbar" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
        <Text className="searchbar__icon">搜索</Text>
        <Text>找生鲜、按类目浏览</Text>
      </View>

      <View className="storebar" onClick={() => Taro.navigateTo({ url: '/pages/stores/index' })}>
        <Text className="storebar__label">配送门店</Text>
        <Text className="storebar__name">{storeName || '选择你附近的门店'}</Text>
        <Text className="storebar__arrow">›</Text>
      </View>

      {carousel && carousel.length > 0 && (
        <Swiper className="banner" indicatorDots autoplay circular interval="4000">
          {carousel.map((item) => (
            <SwiperItem key={item.id}>
              <Image className="banner__img" src={item.image} mode="aspectFill" />
            </SwiperItem>
          ))}
        </Swiper>
      )}

      {first && (
        <View className="section">
          <Text className="section__title">{first.title}</Text>
          <ScrollView className="rail" scrollX enableFlex>
            {first.items.map((item) => (
              <View className="rail__cell" key={item.id}>
                <ProductCard item={item} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {rest.map((section) => (
        <View className="section" key={section.key}>
          <Text className="section__title">{section.title}</Text>
          <View className="grid">
            {section.items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </View>
        </View>
      ))}

      <View className="section">
        <Text className="section__title">猜你喜欢</Text>
        <View className="grid">
          {feed.list.map((item, idx) => (
            <ProductCard key={`${item.id}-${idx}`} item={item} />
          ))}
        </View>
        <Text className="feed__state">
          {feeding ? '加载中...' : feed.hasMore ? `已加载 ${feed.list.length} / ${feed.total}` : `共 ${feed.list.length} 件，没有更多了`}
        </Text>
      </View>
    </View>
  )
}
