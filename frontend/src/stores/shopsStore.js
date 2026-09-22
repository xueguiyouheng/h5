import { create } from 'zustand'
import * as shopApi from '../api'
import { locate } from '../utils/locate'

// 门店数据来自 /api/shop/stores/nearby：门店是卖家的店，与买家的收货地址互不相干
let nearbyRequest = null

export function currentStore(list) {
  return (list ?? []).find((item) => item.current) ?? null
}

export const useShopsStore = create((set, get) => ({
  list: [],
  located: false,
  coords: null,
  loading: false,
  loaded: false,
  error: '',

  // loaded 之后不再翻 loading：面板里的旧列表继续显示，不会被骨架屏掀掉
  load: () => {
    if (nearbyRequest) return nearbyRequest
    const coords = get().coords ?? {}
    set({ loading: !get().loaded, error: '' })
    nearbyRequest = (async () => {
      try {
        const data = await shopApi.fetchNearbyStores(coords)
        set({ ...data, loading: false, loaded: true })
        return data
      } catch (err) {
        set({ loading: false, error: err.message })
        throw err
      } finally {
        nearbyRequest = null
      }
    })()
    return nearbyRequest
  },

  // 授权定位后按距离重排；拒绝授权或浏览器不支持时保持服务端缓存的排序
  relocate: async () => {
    const coords = await locate()
    if (!coords) return false
    set({ coords })
    await get().load()
    return true
  },

  select: async (id) => {
    const selected = await shopApi.selectStore(id, get().coords ?? {})
    await get().load()
    return selected
  },

  reset: () => set({ list: [], located: false, coords: null, loading: false, loaded: false, error: '' }),
}))
