import { create } from 'zustand'
import * as chatApi from '../api'

// 客服时段状态与自动回复都来自后端，前端只保留打字气泡的视觉节奏
export const useChatStore = create((set) => ({
  messages: [],
  typing: false,
  status: { online: true, nextOpenLabel: '' },
  loading: false,
  error: '',

  load: async () => {
    set({ loading: true, error: '' })
    try {
      const [history, status] = await Promise.all([chatApi.fetchChatMessages({ limit: 50 }), chatApi.fetchSupportStatus()])
      set({ messages: history.list, status, loading: false })
      return history
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  refreshStatus: async () => {
    const status = await chatApi.fetchSupportStatus()
    set({ status })
    return status
  },

  /** text 消息直接发送；file 为 File 对象时先上传，接口只登记图片地址 */
  ask: async (text, file) => {
    set({ error: '' })
    try {
      const result = file
        ? await (async () => {
            const uploaded = await chatApi.uploadImage(file)
            return chatApi.sendChatMessage({ file: { url: uploaded.url, name: uploaded.name, size: uploaded.size } })
          })()
        : await chatApi.sendChatMessage({ text })

      set((state) => ({
        messages: [...state.messages, result.message],
        typing: !file && !!result.reply,
      }))

      if (result.reply) {
        // 900ms 打字节奏是设计稿的视觉要求，与后端回复无关
        setTimeout(() => {
          set((state) => ({ messages: [...state.messages, result.reply], typing: false }))
        }, 900)
      }
      return result
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  clear: async () => {
    await chatApi.clearChatHistory()
    set({ messages: [], typing: false })
  },
}))
