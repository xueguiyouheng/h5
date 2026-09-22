import { create } from 'zustand'
import * as authService from '../services/authService'

export const useAuthStore = create((set, get) => ({
  isAuthed: false,
  checking: true,
  loading: false,
  error: '',

  checkAuth: async () => {
    // 已确认过登录态就不再置 checking：复验在后台跑，整屏不会被「正在验证登录状态」顶掉
    set({ checking: !get().isAuthed })
    const ok = await authService.checkAuth()
    if (ok) await authService.hydrate()
    set({ isAuthed: ok, checking: false })
  },

  // 账号可以是用户名也可以是邮箱，后端两种都认
  login: async (account, password) => {
    set({ loading: true, error: '' })
    try {
      await authService.login(account, password)
      await authService.hydrate()
      set({ isAuthed: true, loading: false, error: '' })
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  logout: async () => {
    try {
      await authService.logout()
    } catch {}
    authService.reset()
    set({ isAuthed: false })
  },

  clearError: () => set({ error: '' }),
}))
