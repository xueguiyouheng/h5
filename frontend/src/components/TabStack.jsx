import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Shop from '../pages/Shop'
import Cart from '../pages/Cart'
import Notifications from '../pages/Notifications'
import Profile from '../pages/Profile'
import { useAuthStore } from '../stores/authStore'

const PANES = [
  { path: '/shop', Page: Shop },
  { path: '/cart', Page: Cart },
  { path: '/notifications', Page: Notifications },
  { path: '/profile', Page: Profile },
]

const isTabPath = (path) => PANES.some((pane) => pane.path === path)

/**
 * 四个根 tab 常驻挂载（挂在 Routes 外面，跳到详情页再回来也不会被销毁）。
 * 切走只隐藏不卸载，省掉整棵子树重建带来的闪屏，也保住各自的渲染状态。
 */
export default function TabStack() {
  const { pathname } = useLocation()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const [visited, setVisited] = useState(() => [pathname])
  const activeRef = useRef(null)
  const prevPathRef = useRef(pathname)
  const mountedRef = useRef(new Set([pathname]))

  // 渲染期登记访问过的 tab（React 会立即重渲染），比用 effect 少一帧空白
  if (isAuthed && isTabPath(pathname) && !visited.includes(pathname)) {
    setVisited((prev) => [...prev, pathname])
  }

  // 热切换（该 tab 之前挂载过）才补一段淡入：DOM 复用让切换瞬间完成，淡入给它一个交代。
  // 首次进入时内容还在路上，淡入反而像闪一下；后台标签页会冻结动画时间线，所以先取消上一段。
  // 只用 opacity：transform 会让这一层成为 fixed 子元素的包含块，吸底操作栏会跟着跳。
  useLayoutEffect(() => {
    const from = prevPathRef.current
    const wasMounted = mountedRef.current.has(pathname)
    prevPathRef.current = pathname
    mountedRef.current.add(pathname)
    if (!isTabPath(pathname) || !isTabPath(from) || from === pathname || !wasMounted) return
    const pane = activeRef.current
    if (!pane) return
    pane.getAnimations().forEach((animation) => animation.cancel())
    pane.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' })
  }, [pathname])

  if (!isAuthed) return null

  return PANES.filter(({ path }) => visited.includes(path)).map(({ path, Page }) => (
    <div
      key={path}
      ref={path === pathname ? activeRef : null}
      className={path === pathname ? undefined : 'hidden'}
    >
      <Page />
    </div>
  ))
}
