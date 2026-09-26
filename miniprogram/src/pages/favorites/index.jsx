import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import { addCartItemsBatch, fetchProducts, moneyLabel, removeFavorites } from '../../api'
import { currentStoreId, ensureStore, storeName } from '../../utils/shop'
import './index.scss'

const PAGE_SIZE = 10
const EMPTY = { list: [], page: 0, total: 0, hasMore: false }

/**
 * 收藏：与搜索/类目同一个列表接口，只是多带 favorite=true
 * 一键加购即视为心愿已达成，这批同时移出收藏；移出失败只提示，不能把已成功的加购报成失败
 */
export default function Favorites() {
  const [word, setWord] = useState('')
  const [query, setQuery] = useState('')
  const [feed, setFeed] = useState(EMPTY)
  const [selected, setSelected] = useState([])
  const [dim, setDim] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState('')
  const [notice, setNotice] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loaded, setLoaded] = useState(false)
  // 收藏跟着会员走、不跟门店，所以列表里会混进别家门店的商品，标出来才知道加购会切店
  const [shopId, setShopId] = useState('')
  const seq = useRef(0)
  const busyRef = useRef(false)
  const firstShow = useRef(true)

  async function load(q, page, append) {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1
    const callId = seq.current
    if (append) setFeeding(true)
    else setDim(true)
    try {
      const res = await fetchProducts({ favorite: true, q, page, pageSize: PAGE_SIZE })
      if (seq.current !== callId) return
      setFeed((prev) =>
        append
          ? { list: prev.list.concat(res.list), page: res.page, total: res.total, hasMore: res.hasMore }
          : { list: res.list, page: res.page, total: res.total, hasMore: res.hasMore },
      )
      setLoadError('')
      if (!append) setNotice(null)
    } catch (err) {
      if (seq.current === callId) setLoadError(err.message || '收藏加载失败')
    } finally {
      if (seq.current === callId) {
        setDim(false)
        setFeeding(false)
        setLoaded(true)
      }
      busyRef.current = false
    }
  }

  // 从详情页取消收藏回来要能看到列表已经短了一截
  useDidShow(() => {
    currentStoreId().then(setShopId)
    if (firstShow.current) {
      firstShow.current = false
      load('', 1, false)
      return
    }
    load(query, 1, false)
  })

  useReachBottom(() => {
    if (feed.hasMore && !dim) load(query, feed.page + 1, true)
  })

  const items = feed.list
  // 售罄的不给勾：批量加购是整批生效整批不生效，混进去会把能买的也一起挡掉
  const buyable = items.filter((item) => item.stock > 0)
  const selectedIds = selected.filter((id) => buyable.some((item) => item.id === id))
  const allSelected = buyable.length > 0 && selectedIds.length === buyable.length
  const selectedTotal = selectedIds.reduce(
    (sum, id) => sum + ((buyable.find((item) => item.id === id) || {}).priceValue || 0),
    0,
  )

  function search(value) {
    const next = String(value).trim()
    setQuery(next)
    setFeed(EMPTY)
    setSelected([])
    load(next, 1, false)
  }

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)))

  const toggleAll = () => setSelected(allSelected ? [] : buyable.map((item) => item.id))

  async function drop(ids, text) {
    try {
      await removeFavorites(ids)
      setNotice({ ok: true, text })
    } catch (err) {
      setNotice({ ok: false, text: err.message || '取消收藏失败，请重试' })
    }
  }

  async function addSelected() {
    if (busy || !selectedIds.length) return
    const picked = buyable.filter((item) => selectedIds.includes(item.id))
    // 购物车一单一店：分属几家店的选择要分开下，服务端那边也是整批拒
    if (new Set(picked.map((item) => item.storeId || shopId)).size > 1) {
      setNotice({ ok: false, text: '所选商品分属多家门店，一次只能加入同一家门店的车' })
      return
    }
    setBusy(true)
    const ids = selectedIds
    try {
      const switched = await ensureStore(picked[0].storeId)
      const prefix = switched ? `已切到「${switched}」，` : ''
      await addCartItemsBatch(ids.map((id) => ({ product_id: id, qty: 1 })))
      setSelected([])
      setShopId(await currentStoreId())
      try {
        await removeFavorites(ids)
        setFeed((prev) => ({ ...prev, list: prev.list.filter((item) => !ids.includes(item.id)) }))
        setNotice({ ok: true, text: `${prefix}已加入购物车，并移出收藏（${ids.length}）` })
      } catch (err) {
        setNotice({ ok: true, text: `${prefix}已加入购物车，但取消收藏失败：${err.message || '请稍后手动移除'}` })
      }
      const res = await fetchProducts({ favorite: true, q: query, page: 1, pageSize: PAGE_SIZE })
      setFeed((prev) => ({ ...prev, list: res.list, total: res.total, hasMore: res.hasMore, page: 1 }))
    } catch (err) {
      setNotice({ ok: false, text: err.message || '加入购物车失败，请重试' })
    } finally {
      setBusy(false)
    }
  }

  async function dropOne(item) {
    if (removing) return
    setRemoving(item.id)
    setFeed((prev) => ({ ...prev, list: prev.list.filter((x) => x.id !== item.id) }))
    await drop([item.id], `已取消收藏 ${item.name}`)
    setRemoving('')
  }

  return (
    <View className="favorites">
      <View className="favbar">
        <Input
          className="favbar__input"
          type="text"
          confirmType="search"
          placeholder="在收藏中搜索"
          value={word}
          onInput={(e) => setWord(e.detail.value)}
          onConfirm={() => search(word)}
        />
        {word ? (
          <Text className="favbar__clear" onClick={() => { setWord(''); search('') }}>
            清除
          </Text>
        ) : null}
      </View>

      {notice ? (
        <Text className={`fav__notice ${notice.ok ? 'fav__notice--ok' : ''}`}>{notice.text}</Text>
      ) : null}

      {/* 屏上有内容就不报红：后台刷新失败留着旧数据，重进本页即重试；什么都没有时走下面的空态并给出重新加载 */}
      {loaded && !items.length && !dim ? (
        <View className="fav__empty">
          <Text className="tip">{loadError ? loadError : query ? '收藏里没有匹配的商品' : '还没有收藏任何商品'}</Text>
          {loadError ? (
            <Text className="tip__action" onClick={() => load(query, 1, false)}>
              重新加载
            </Text>
          ) : (
            <Text className="tip__action" onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
              去逛逛
            </Text>
          )}
        </View>
      ) : (
        <View className={`fav__list ${dim ? 'fav__list--dim' : ''}`}>
          {items.map((item) => (
            <View className="fav" key={item.id}>
              <View
                className={`check ${selectedIds.includes(item.id) ? 'check--on' : ''} ${item.stock <= 0 ? 'check--off' : ''}`}
                onClick={() => (item.stock > 0 ? toggle(item.id) : undefined)}
              />
              <Image
                className="fav__img"
                src={item.image}
                mode="aspectFit"
                onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(item.id)}` })}
              />
              <View
                className="fav__main"
                onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(item.id)}` })}
              >
                <View className="fav__titlerow">
                  <Text className="fav__name">{item.name}</Text>
                  {item.stock <= 0 ? <Text className="fav__out">库存不足</Text> : null}
                  {shopId && item.storeId && item.storeId !== shopId ? (
                    <Text className="fav__store">{storeName(item.storeId)}</Text>
                  ) : null}
                </View>
                <Text className="fav__price">{item.price}</Text>
              </View>
              <Text className="fav__drop" onClick={() => dropOne(item)}>
                ×
              </Text>
            </View>
          ))}
          {feeding ? <Text className="fav__more">加载中...</Text> : null}
          {!feed.hasMore && !feeding && !dim ? <Text className="fav__more">没有更多了</Text> : null}
        </View>
      )}

      {items.length ? (
        <>
          <View className="fav__foot">
            <View
              className={`check ${allSelected ? 'check--on' : ''}`}
              onClick={toggleAll}
            />
            <Text className="fav__all" onClick={toggleAll}>
              全选（{buyable.length} 件）
            </Text>
            <Text className="fav__total">合计 {moneyLabel(selectedTotal.toFixed(2))}</Text>
          </View>

          <Text
            className={`btn fav__submit ${!selectedIds.length || busy ? 'btn--dim' : ''}`}
            onClick={addSelected}
          >
            {busy ? '加入中...' : `一键加入购物车${selectedIds.length ? `（${selectedIds.length}）` : ''}`}
          </Text>
        </>
      ) : null}
    </View>
  )
}
