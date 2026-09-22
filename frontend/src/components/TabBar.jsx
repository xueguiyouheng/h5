import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCartStore } from '../stores/cartStore'
import { useNotificationStore } from '../stores/notificationStore'

// 图标是线性 SVG，靠 currentColor 跟着选中态换色，所以不能用固定填色的 svg 资源
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.6 6.6 9 1.3l7.4 5.3V15a1.4 1.4 0 0 1-1.4 1.4H3A1.4 1.4 0 0 1 1.6 15z" />
      <path d="M6.7 16.4V11h4.6v5.4" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.6 5.4h12.8l-1.1 9.2a1.4 1.4 0 0 1-1.4 1.2H5.1a1.4 1.4 0 0 1-1.4-1.2z" />
      <path d="M6.2 5.4V4a2.8 2.8 0 0 1 5.6 0v1.4" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.3 7.6a4.7 4.7 0 0 1 9.4 0c0 4 1.5 5.3 1.5 5.3H2.8s1.5-1.3 1.5-5.3z" />
      <path d="M7 15.2a1.9 1.9 0 0 0 4 0" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="5.2" r="3" />
      <path d="M2.6 16.6c0-3.2 2.9-5.1 6.4-5.1s6.4 1.9 6.4 5.1" />
    </svg>
  )
}

const TABS = [
  { path: '/shop', label: '首页', Icon: HomeIcon },
  { path: '/cart', label: '购物车', Icon: CartIcon, badgeBg: '#00b861', cartTarget: true },
  { path: '/notifications', label: '消息', Icon: BellIcon, badgeBg: '#ff7465' },
  { path: '/profile', label: '我的', Icon: UserIcon },
]

const TAB_PATHS = TABS.map((tab) => tab.path)

const BADGE = 'absolute -top-[3px] right-[3px] min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-4 text-center text-white font-medium'

// 底部导航只在四个根页显示，其余页面（详情/结算/中台）由 useLocation 挡掉
export default function TabBar() {
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const visible = TAB_PATHS.includes(pathname)

  const cartCount = useCartStore((s) => s.items.length)
  const unread = useNotificationStore((s) => s.unread)
  const notificationsLoaded = useNotificationStore((s) => s.list.length > 0)
  const notificationsLoading = useNotificationStore((s) => s.loading)
  const loadNotifications = useNotificationStore((s) => s.load)

  // 消息角标要常在，未读数以服务端为准，不能只在通知页里才拉
  useEffect(() => {
    if (!visible || notificationsLoaded || notificationsLoading) return
    loadNotifications().catch(() => {})
  }, [visible, notificationsLoaded, notificationsLoading, loadNotifications])

  const cartBadgeRef = useRef(null)

  // 加购后角标弹一下，反馈从原来的页头购物车搬到 tab 上
  useEffect(() => {
    if (cartCount === 0) return
    cartBadgeRef.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.45)' },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease-out' }
    )
  }, [cartCount])

  if (!visible) return null

  const counts = { '/cart': cartCount, '/notifications': unread }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-[480px] bg-white border-t border-[#f4f5f7] flex items-stretch justify-around">
      {TABS.map(({ path, label, Icon, badgeBg, cartTarget }) => {
        const active = pathname === path
        const count = counts[path] ?? 0
        return (
          <button
            key={path}
            className="flex flex-1 flex-col items-center justify-center gap-[3px] h-[56px] border-none bg-none p-0 cursor-pointer font-[inherit]"
            type="button"
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-cart-target={cartTarget ? '' : undefined}
            style={{ color: active ? '#00b861' : '#b6bbb9' }}
            onClick={() => {
              if (!active) navigate(path)
            }}
          >
            <span className="relative flex">
              <Icon />
              {count > 0 && (
                <span
                  ref={cartTarget ? cartBadgeRef : undefined}
                  className={BADGE}
                  style={{ backgroundColor: badgeBg }}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-[13px]">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
