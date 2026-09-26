import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components'
import useRequest from '../../hooks/useRequest'
import ProductCard from '../../components/ProductCard'
import { fetchProductDetail, addCartItem, setCartItemQty, toggleFavorite } from '../../api'
import { ensureStore } from '../../utils/shop'
import './index.scss'

export default function Product() {
  const router = useRouter()
  const id = router.params.id || ''
  const { data: product, loading, error, refresh } = useRequest(() => fetchProductDetail(id), { skip: !id })
  const [qty, setQty] = useState(1)
  const [collected, setCollected] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!id) {
    return (
      <View className="page">
        <Text className="tip">链接里没有商品编号</Text>
      </View>
    )
  }

  if (loading && !product) {
    return (
      <View className="page page--flush">
        <View className="sk sk--hero" />
        <View className="sk sk--line w-40" />
        <View className="sk sk--line w-60" />
      </View>
    )
  }

  // 详情已在屏上就不整页报错：回到本页刷新失败时留着商品内容继续加购，下拉/重进即重试
  if (error && !product) {
    return (
      <View className="page">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={refresh}>
          重新加载
        </Text>
      </View>
    )
  }

  const stock = product.stock ?? 0
  const soldOut = stock <= 0
  const images = product.images && product.images.length ? product.images : [product.image]
  const collectedNow = collected || product.collected === true

  // 加购与收藏都要把服务端回传的权威数据拿回来：库存与收藏数以服务端为准
  async function withBusy(fn) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  // 详情页可以从收藏或分享链接进到别家门店的商品，加购前先切到它那家
  const addToCart = () =>
    withBusy(async () => {
      const switched = await ensureStore(product.storeId)
      await addCartItem(product.id, qty)
      Taro.showToast({ title: switched ? `已切到「${switched}」并加入购物车` : '已加入购物车', icon: 'none' })
    })

  // 立即购买只结算这一件：加购后把该行数量改成当前选择，再带着行 id 进结算页。
  // 不带行 id 的话结算页会按购物车勾选走，把用户上次勾的商品一起下单
  const buyNow = () =>
    withBusy(async () => {
      await ensureStore(product.storeId)
      const cart = await addCartItem(product.id, qty)
      const line = (cart.items || []).find((i) => i.product_id === product.id)
      if (!line) throw new Error('加入购物车失败，请重试')
      if (line.qty !== qty) await setCartItemQty(line.id, qty)
      Taro.navigateTo({ url: `/pages/checkout/index?items=${encodeURIComponent(line.id)}` })
    })

  const onCollect = () =>
    withBusy(async () => {
      const res = await toggleFavorite(product.id)
      setCollected((res || {}).collected === true)
    })

  const step = (delta) => {
    const next = qty + delta
    if (next < 1) return
    // 上限按库存收：超过库存下单会被服务端拒，端上先拦住比报错体验好
    if (stock > 0 && next > stock) {
      Taro.showToast({ title: `库存只剩 ${stock} 件`, icon: 'none' })
      return
    }
    setQty(next)
  }

  return (
    <View className="page page--flush detail">
      <Swiper className="hero" indicatorDots circular>
        {images.map((src, idx) => (
          <SwiperItem key={`${src}-${idx}`}>
            <Image className="hero__img" src={src} mode="aspectFill" />
          </SwiperItem>
        ))}
      </Swiper>

      <View className="detail__body">
        <View className="detail__prices">
          <Text className="detail__price">{product.price}</Text>
          <Text className="detail__unit">{product.unit}</Text>
        </View>
        <Text className="detail__name">{product.name}</Text>
        <Text className={`detail__stock ${soldOut ? 'detail__stock--out' : ''}`}>
          {soldOut ? '暂时售罄' : `库存 ${stock} 件`}
        </Text>

        {product.description ? <Text className="detail__desc">{product.description}</Text> : null}

        {product.nutrition && product.nutrition.length ? (
          <View className="nutri">
            <Text className="nutri__title">营养与规格</Text>
            {product.nutrition.map((row) => (
              <View className="nutri__row" key={row.label || row.name}>
                <Text className="nutri__label">{row.label || row.name}</Text>
                <Text className="nutri__value">{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {product.related && product.related.length ? (
          <View className="related">
            <Text className="related__title">同类推荐</Text>
            <View className="grid">
              {product.related.map((item) => (
                <ProductCard key={item.id} item={item} />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View className="buybar">
        <View className="buybar__icon" onClick={onCollect}>
          <Text className={`buybar__star ${collectedNow ? 'buybar__star--on' : ''}`}>☆</Text>
          <Text className="buybar__icon_text">收藏</Text>
        </View>
        <View className="stepper">
          <Text className={`stepper__btn ${qty <= 1 ? 'stepper__btn--dim' : ''}`} onClick={() => step(-1)}>
            －
          </Text>
          <Text className="stepper__num">{qty}</Text>
          <Text className="stepper__btn" onClick={() => step(1)}>
            ＋
          </Text>
        </View>
        <Text className={`buybar__btn buybar__btn--ghost ${soldOut || busy ? 'buybar__btn--dim' : ''}`} onClick={addToCart}>
          加入购物车
        </Text>
        <Text className={`buybar__btn ${soldOut || busy ? 'buybar__btn--dim' : ''}`} onClick={buyNow}>
          立即购买
        </Text>
      </View>
    </View>
  )
}
