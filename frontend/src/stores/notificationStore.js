import { create } from 'zustand'
import iconOffer from '../assets/notifications/icon-offer.svg'
import iconPayment from '../assets/notifications/icon-payment.svg'
import iconPromo from '../assets/notifications/icon-promo.svg'
import * as notificationApi from '../api'

// 图标与底色映射留在前端，通知内容来自 /api/notifications
export const KINDS = {
  offer: { icon: iconOffer, size: 'w-[20px] h-[21px]', circle: 'bg-[#fff3e5]' },
  payment: { icon: iconPayment, size: 'w-[20px] h-[14px]', circle: 'bg-[#e5f2ff]' },
  promo: { icon: iconPromo, size: 'w-[18px] h-[18px]', circle: 'bg-[#ff7465]' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function timeLabel(daysAgo, now = new Date()) {
  const date = new Date(now.getTime() - daysAgo * 86400000)
  return daysAgo < 7 ? WEEKDAYS[date.getDay()] : `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function unreadCount(readIds) {
  const ids = readIds ?? []
  return useNotificationStore.getState().list.filter((n) => !ids.includes(n.id)).length
}

let notificationRequest = null

export const useNotificationStore = create((set, get) => ({
  list: [],
  readIds: [],
  unread: 0,
  loading: false,
  loaded: false,
  error: '',

  // tabbar 角标与通知页会各自触发拉取，合并成一次请求
  load: () => {
    if (notificationRequest) return notificationRequest
    // loaded 之后不再翻 loading：旧列表继续显示、后台静默刷新，避免骨架屏顶掉内容
    set({ loading: !get().loaded, error: '' })
    notificationRequest = (async () => {
      try {
        const [page, count] = await Promise.all([notificationApi.fetchNotifications({ pageSize: 50 }), notificationApi.fetchUnreadCount()])
        set({
          list: page.list,
          readIds: page.list.filter((n) => n.read).map((n) => n.id),
          unread: count,
          loading: false,
          loaded: true,
        })
      } catch (err) {
        set({ loading: false, error: err.message })
        throw err
      } finally {
        notificationRequest = null
      }
    })()
    return notificationRequest
  },

  markRead: async (id) => {
    if (get().readIds.includes(id)) return null
    set((state) => ({ readIds: [...state.readIds, id], unread: Math.max(0, state.unread - 1) }))
    return notificationApi.markNotificationsRead([id])
  },

  markAllRead: async () => {
    set((state) => ({ readIds: state.list.map((n) => n.id), unread: 0 }))
    return notificationApi.markAllNotificationsRead()
  },
}))
