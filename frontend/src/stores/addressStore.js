import { create } from 'zustand'
import * as addressApi from '../api'

export function formatAddressLines(detail) {
  const parts = String(detail)
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return [parts[0] ?? '']
  return [parts[0], parts.slice(1).join(', ')]
}

// 即时反馈用的规则，服务端 ValidateAddress 是同一口径
const RULES = {
  label: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if (value.length < 2 || value.length > 16) return { error: '名称需 2-16 个字符' }
    return { value }
  },
  detail: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if (value.length < 12) return { error: '地址至少 12 个字符' }
    if (formatAddressLines(value).length < 2) return { error: '地址需用逗号分隔街道与城市' }
    return { value }
  },
}

export function validateAddressField(key, raw) {
  const rule = RULES[key]
  if (!rule) return { value: raw }
  return rule(String(raw))
}

export function defaultAddress(list, defaultId) {
  return (list ?? []).find((item) => item.id === defaultId) ?? null
}

// 地址簿来自 /api/addresses，删默认地址时由服务端回退到列表第一条
let addressRequest = null

export const useAddressStore = create((set, get) => ({
  list: [],
  defaultId: null,
  loading: false,
  loaded: false,
  error: '',

  apply: (data) => set({ list: data.list ?? [], defaultId: data.defaultId ?? null }),

  // 地址页 / Checkout / Profile 会同时拉同一份数据，合并成一次请求
  load: () => {
    if (addressRequest) return addressRequest
    // loaded 之后不再翻 loading：旧内容继续显示、后台静默刷新，骨架屏不会把页面顶掉
    set({ loading: !get().loaded, error: '' })
    addressRequest = (async () => {
      try {
        const data = await addressApi.fetchAddresses()
        get().apply(data)
        set({ loading: false, loaded: true })
        return data
      } catch (err) {
        set({ loading: false, error: err.message })
        throw err
      } finally {
        addressRequest = null
      }
    })()
    return addressRequest
  },

  addAddress: async (address, { asDefault } = {}) => {
    await addressApi.createAddress({ ...address, asDefault })
    return get().load()
  },

  updateAddress: async (id, patch) => {
    await addressApi.updateAddress(id, patch)
    return get().load()
  },

  removeAddress: async (id) => {
    await addressApi.deleteAddress(id)
    return get().load()
  },

  setDefault: async (id) => {
    await addressApi.setDefaultAddress(id)
    return get().load()
  },
}))
