import request from '../utils/request'
import { useCartStore } from '../stores/cartStore'
import { useProfileStore } from '../stores/profileStore'
import { useAddressStore } from '../stores/addressStore'
import { useShopsStore } from '../stores/shopsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useHelpStore } from '../stores/helpStore'
import { useNotificationStore } from '../stores/notificationStore'

export function login(account, password) {
  return request.post('/login', { username: account, password })
}

export function logout() {
  return request.post('/logout')
}

/** 登录态探测直接用 /api/profile，不再借 /api/users 猜 */
export async function checkAuth() {
  try {
    await request.get('/profile')
    return true
  } catch {
    return false
  }
}

/** 登录成功后一次性拉取会员的全部服务端数据，页面无需各自等待 */
export async function hydrate() {
  await Promise.allSettled([
    useProfileStore.getState().load(),
    useCartStore.getState().load(),
    useAddressStore.getState().load(),
    useShopsStore.getState().load(),
    useSettingsStore.getState().load(),
    useHelpStore.getState().load(),
    useNotificationStore.getState().load(),
  ])
}

export function reset() {
  useCartStore.setState({ items: [] })
  useNotificationStore.setState({ list: [], readIds: [], unread: 0 })
  useAddressStore.setState({ list: [], defaultId: null })
  useShopsStore.getState().reset()
  useHelpStore.setState({ faqs: [], votes: {} })
  useProfileStore.getState().clearLocal()
}
