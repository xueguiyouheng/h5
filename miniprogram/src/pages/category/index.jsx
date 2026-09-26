import Taro, { useReachBottom } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import ProductCard from '../../components/ProductCard'
import { addCartItem, fetchCategories, fetchCategory, fetchProducts } from '../../api'
import { ensureStore } from '../../utils/shop'
import './index.scss'

const PAGE_SIZE = 10
const EMPTY = { list: [], page: 0, total: 0, hasMore: false }

/**
 * 类目：类目与子类目都是常驻结构，换筛选时旧商品先压暗留着
 * 「切子类目不许闪屏」是既定要求，所以这里绝不清空列表再等接口
 */
export default function Category() {
  const [cats, setCats] = useState([])
  const [activeId, setActiveId] = useState('')
  const [sub, setSub] = useState('')
  const [meta, setMeta] = useState(null)
  const [feed, setFeed] = useState(EMPTY)
  const [dim, setDim] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    fetchCategories({ page: 1, pageSize: 20 })
      .then((page) => {
        const list = page.list || []
        setCats(list)
        if (list.length) setActiveId(list[0].id)
      })
      .catch((err) => setError(err.message || '类目加载失败'))
  }, [])

  // 类目元信息只跟着类目走：子类目 tab 的名字要在这里拿，换子类目不必重取
  useEffect(() => {
    if (!activeId) return undefined
    let cancelled = false
    setMeta(null)
    fetchCategory(activeId)
      .then((doc) => {
        if (!cancelled) setMeta(doc)
      })
      .catch(() => {
        // 元信息失败不阻塞商品：拿不到子类目就只展示全部
      })
    return () => {
      cancelled = true
    }
  }, [activeId])

  async function load(categoryId, subcategory, page, append) {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1
    const callId = seq.current
    if (append) setFeeding(true)
    else setDim(true)
    try {
      const res = await fetchProducts({ categoryId, subcategory, page, pageSize: PAGE_SIZE })
      if (seq.current !== callId) return
      setFeed((prev) =>
        append
          ? { list: prev.list.concat(res.list), page: res.page, total: res.total, hasMore: res.hasMore }
          : { list: res.list, page: res.page, total: res.total, hasMore: res.hasMore },
      )
      setError('')
    } catch (err) {
      if (seq.current === callId) setError(err.message || '商品加载失败')
    } finally {
      if (seq.current === callId) {
        setDim(false)
        setFeeding(false)
      }
      busyRef.current = false
    }
  }

  useEffect(() => {
    if (!activeId) return
    load(activeId, sub, 1, false)
  }, [activeId, sub])

  useReachBottom(() => {
    if (feed.hasMore && !dim) load(activeId, sub, feed.page + 1, true)
  })

  // 类目里的商品本来就属于当前门店，切店后旧列表残留时才需要自动跟到商品那家店去
  async function addToCart(item) {
    try {
      const switched = await ensureStore(item.storeId)
      await addCartItem(item.id, 1)
      Taro.showToast({ title: switched ? `已切到「${switched}」并加入购物车` : '已加入购物车', icon: 'none' })
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '加购失败', icon: 'none' })
    }
  }

  const subcategories = (meta && meta.subcategories) || ['All']
  const active = cats.find((c) => c.id === activeId) || null

  return (
    <View className="cat">
      <ScrollView className="cat__rail" scrollX enableFlex showScrollbar={false}>
        {cats.length ? (
          cats.map((item) => (
            <Text
              key={item.id}
              className={`chip ${item.id === activeId ? 'chip--on' : ''}`}
              onClick={() => {
                setActiveId(item.id)
                setSub('')
              }}
            >
              {item.label}
            </Text>
          ))
        ) : (
          <Text className="cat__loading">类目加载中...</Text>
        )}
      </ScrollView>

      <View className="cat__sub">
        {subcategories.map((label) => (
          <Text
            key={label}
            className={`chip chip--sub ${label === 'All' ? (sub ? '' : 'chip--on') : sub === label ? 'chip--on' : ''}`}
            onClick={() => setSub(label === 'All' ? '' : label)}
          >
            {label}
          </Text>
        ))}
      </View>

      <Text className="cat__count">
        {active ? `${active.label} · ${active.productCount} 件在售` : ''}
      </Text>

      {error && !feed.list.length ? (
        <Text className="tip">{error}</Text>
      ) : (
        <View className={`grid cat__grid ${dim ? 'cat__grid--dim' : ''}`}>
          {feed.list.map((item, idx) => (
            <ProductCard key={`${item.id}-${idx}`} item={item} showAdd onAdd={addToCart} />
          ))}
          {!feed.list.length && !dim ? <Text className="tip">该类目下暂无商品</Text> : null}
        </View>
      )}

      {feeding ? <Text className="cat__more">加载中...</Text> : null}
      {!feed.hasMore && feed.list.length && !feeding ? <Text className="cat__more">没有更多了</Text> : null}
    </View>
  )
}
