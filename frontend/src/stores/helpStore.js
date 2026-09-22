import { create } from 'zustand'
import * as helpApi from '../api'

// 图标与底色映射仍由前端决定，问题/答案文案来自 /api/help/faqs
export function resolvedCount(votes) {
  return useHelpStore.getState().faqs.filter((faq) => votes?.[faq.id] === true).length
}

export function voteLabel(votes, id) {
  if (votes?.[id] === true) return '已解决'
  if (votes?.[id] === false) return '待跟进'
  return null
}

export const useHelpStore = create((set, get) => ({
  faqs: [],
  support: { hours: '', phone: '', email: '' },
  votes: {},
  loading: false,
  loaded: false,
  error: '',

  // 拉过一次后不再翻 loading，HelpCenter/Profile 的值列不会被供应商屏闪掉
  load: async () => {
    set({ loading: !get().loaded, error: '' })
    try {
      const data = await helpApi.fetchFaqs()
      const votes = {}
      data.list.forEach((faq) => {
        if (faq.myVote !== null) votes[faq.id] = faq.myVote
      })
      set({ faqs: data.list, support: { hours: '', phone: '', email: '', ...data.support }, votes, loading: false, loaded: true })
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  vote: async (id, helpful) => {
    const result = await helpApi.voteFaq(id, helpful)
    set((state) => ({
      votes: { ...state.votes, [id]: helpful },
      faqs: state.faqs.map((faq) => (faq.id === id ? { ...faq, myVote: helpful } : faq)),
    }))
    return result
  },
}))
