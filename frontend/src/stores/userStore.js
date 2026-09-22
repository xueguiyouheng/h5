import { create } from 'zustand'
import * as userService from '../services/userService'

export const useUserStore = create((set, get) => ({
  users: [],
  total: 0,
  page: 1,
  pageSize: 10,
  loading: false,
  error: '',

  fetchUsers: async (page, pageSize) => {
    const p = page ?? get().page
    const ps = pageSize ?? get().pageSize
    set({ loading: true, error: '' })
    try {
      const data = await userService.getUsers(p, ps)
      set({ users: data.list, total: data.total, page: p, pageSize: ps, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  setPage: (page) => {
    get().fetchUsers(page)
  },
}))
