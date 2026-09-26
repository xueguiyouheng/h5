import { useReachBottom } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import ProductCard from '../../components/ProductCard'
import { fetchHotSearch, fetchProducts } from '../../api'
import useRequest from '../../hooks/useRequest'
import './index.scss'

const PAGE_SIZE = 10
const EMPTY = { list: [], page: 0, total: 0, hasMore: false }

/**
 * 搜索：关键词走 /shop/products?q=，与类目页同一个接口，只是过滤字段不同
 * 结果区沿用「旧结果压暗、新结果到了再换」的做法，切词不闪屏
 */
export default function Search() {
  const hot = useRequest(fetchHotSearch)
  const [word, setWord] = useState('')
  const [query, setQuery] = useState('')
  const [feed, setFeed] = useState(EMPTY)
  const [dim, setDim] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const busyRef = useRef(false)

  async function load(q, page, append) {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1
    const callId = seq.current
    if (append) setFeeding(true)
    else setDim(true)
    try {
      const res = await fetchProducts({ q, page, pageSize: PAGE_SIZE })
      if (seq.current !== callId) return
      setFeed((prev) =>
        append
          ? { list: prev.list.concat(res.list), page: res.page, total: res.total, hasMore: res.hasMore }
          : { list: res.list, page: res.page, total: res.total, hasMore: res.hasMore },
      )
      setError('')
    } catch (err) {
      if (seq.current === callId) setError(err.message || '搜索失败')
    } finally {
      if (seq.current === callId) {
        setDim(false)
        setFeeding(false)
      }
      busyRef.current = false
    }
  }

  function submit(keyword) {
    const next = String(keyword === undefined ? word : keyword).trim()
    setWord(next)
    setQuery(next)
    setFeed(EMPTY)
    load(next, 1, false)
  }

  useReachBottom(() => {
    if (query && feed.hasMore && !dim) load(query, feed.page + 1, true)
  })

  const keywords = (hot.data && hot.data.keywords) || []

  return (
    <View className="search">
      <View className="search__bar">
        <Input
          className="search__input"
          type="text"
          confirmType="search"
          placeholder="搜商品名"
          value={word}
          onInput={(e) => setWord(e.detail.value)}
          onConfirm={() => submit()}
        />
        <Text className="search__go" onClick={() => submit()}>
          搜索
        </Text>
      </View>

      {!query ? (
        <View className="hot">
          <Text className="hot__title">大家在搜</Text>
          <ScrollView className="hot__rail" scrollX showScrollbar={false}>
            {keywords.length ? (
              keywords.map((item) => (
                <Text key={item} className="chip" onClick={() => submit(item)}>
                  {item}
                </Text>
              ))
            ) : (
              <Text className="hot__loading">加载中...</Text>
            )}
          </ScrollView>
          <Text className="hot__desc">搜不到就逛逛分类，生鲜的库存以门店实时为准</Text>
        </View>
      ) : null}

      {query ? (
        <View className="search__result">
          <Text className="search__state">
            {`“${query}” 共 ${feed.total} 个结果`}
          </Text>
          {error && !feed.list.length ? (
            <Text className="tip">{error}</Text>
          ) : (
            <View className={`grid search__grid ${dim ? 'search__grid--dim' : ''}`}>
              {feed.list.map((item, idx) => (
                <ProductCard key={`${item.id}-${idx}`} item={item} />
              ))}
              {!feed.list.length && !dim ? <Text className="tip">没有匹配的商品，换个词试试</Text> : null}
            </View>
          )}
          {feeding ? <Text className="search__more">加载中...</Text> : null}
        </View>
      ) : null}
    </View>
  )
}
