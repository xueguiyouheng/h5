import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import * as accountApi from '../api'

export const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'zh', label: '简体中文' },
  { key: 'ms', label: 'Bahasa Malaysia' },
]

export function languageLabel(key) {
  return LANGUAGES.find((item) => item.key === key)?.label ?? LANGUAGES[0].label
}

export function ratingSummary(ratings) {
  const list = ratings ?? []
  if (list.length === 0) return null
  const average = list.reduce((sum, value) => sum + value, 0) / list.length
  return { average: Math.round(average * 10) / 10, count: list.length }
}

// 接口加载完成前先用这份文案，避免注册页/设置页出现空白段落
export const LEGAL_COPY = {
  terms:
    '下单后订单金额将按所选商品与数量结算，优惠券按门槛金额抵扣。配送范围内的订单满 $20 免运费，超时未取货的自提订单保留 24 小时后自动取消并原路退款。',
  privacy:
    '账号仅保留昵称、手机号与收货地址用于配送；购物车与优惠券记录保存在服务端账号下，可在 My Profile 与 My Address 中随时修改或删除。',
}

/** 条款与隐私文案取自 /api/legal/{key} */
export function useLegalCopy() {
  const { data } = useQuery({
    queryKey: ['legal'],
    queryFn: async () => {
      const [terms, privacy] = await Promise.all([accountApi.fetchLegal('terms'), accountApi.fetchLegal('privacy')])
      return { terms: terms.body, privacy: privacy.body }
    },
    staleTime: 3600000,
  })
  return { ...LEGAL_COPY, ...(data ?? {}) }
}

export const useSettingsStore = create((set, get) => ({
  language: 'en',
  ratings: [],
  loading: false,
  loaded: false,
  error: '',

  // 拉过一次后 loading 不再翻 true，避免回到设置页时值列被骨架屏闪掉
  load: async () => {
    set({ loading: !get().loaded, error: '' })
    try {
      const data = await accountApi.fetchSettings()
      set({ language: data.language, ratings: data.ratings, loading: false, loaded: true })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  setLanguage: async (key) => {
    set({ language: key })
    await accountApi.saveLanguage(key)
  },

  addRating: async (value) => {
    const result = await accountApi.submitRating(Math.min(5, Math.max(1, value)))
    await get().load()
    return result
  },
}))
