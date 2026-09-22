import { useNavigate } from 'react-router-dom'
import Chevron from '../components/Chevron'
import { ValueSkeleton } from '../components/Skeleton'
import avatar from '../assets/profile/avatar.png'
import iconOrder from '../assets/profile/icon-order.svg'
import iconProfile from '../assets/profile/icon-profile.svg'
import iconVoucher from '../assets/profile/icon-voucher.svg'
import iconFavorite from '../assets/profile/icon-favorite.svg'
import iconAddress from '../assets/profile/icon-address.svg'
import iconNotification from '../assets/profile/icon-notification.svg'
import iconHelp from '../assets/profile/icon-help.svg'
import iconSetting from '../assets/profile/icon-setting.svg'
import iconLogout from '../assets/profile/icon-logout.svg'
import iconAdmin from '../assets/profile/icon-admin.svg'
import { useCartStore, parsePrice } from '../stores/cartStore'
import { useOrders, useVouchers, useFavoriteCount } from '../hooks/useShopData'
import { useProfileStore } from '../stores/profileStore'
import { defaultAddress, useAddressStore } from '../stores/addressStore'
import { languageLabel, ratingSummary, useSettingsStore } from '../stores/settingsStore'
import { resolvedCount, useHelpStore } from '../stores/helpStore'
import { unreadCount, useNotificationStore } from '../stores/notificationStore'
import { useAuthStore } from '../stores/authStore'

function MenuRow({ icon, label, value, valueLoading, to, onNavigate }) {
  const content = (
    <>
      <img className="shrink-0 w-[21px] h-[21px]" src={icon} alt="" />
      <span className="flex-1 min-w-0 text-sm font-medium text-black truncate">{label}</span>
      {valueLoading ? <ValueSkeleton /> : value && <span className="text-xs text-[#b6bbb9]">{value}</span>}
      <Chevron />
    </>
  )

  const className = `flex items-center gap-3 h-[61px] w-full border-none bg-none p-0 text-left ${
    to ? 'cursor-pointer' : 'cursor-default'
  }`

  if (!to) {
    return <div className={className}>{content}</div>
  }
  return (
    <button type="button" className={className} onClick={() => onNavigate(to)}>
      {content}
    </button>
  )
}

function Profile() {
  const navigate = useNavigate()
  const items = useCartStore((s) => s.items)
  const logout = useAuthStore((s) => s.logout)
  const username = useProfileStore((s) => s.username)
  const isAdmin = useProfileStore((s) => s.isAdmin)
  const userName = username.split(' ')[0] || username

  const cartTotal = items.reduce((sum, i) => sum + parsePrice(i.price) * i.qty, 0)
  const { data: vouchers, isPending: vouchersPending } = useVouchers()
  const voucherRows = (vouchers ?? []).filter((v) => cartTotal >= v.minSpend)
  const nextGap = (vouchers ?? [])
    .filter((v) => cartTotal < v.minSpend)
    .reduce((min, v) => Math.min(min, v.minSpend - cartTotal), Infinity)
  const { data: orderData, isPending: ordersPending } = useOrders('ongoing')
  const ongoingOrders = orderData?.total ?? 0
  const { data: favoriteTotal, isPending: favoritesPending } = useFavoriteCount()
  const addressList = useAddressStore((s) => s.list)
  const addressDefaultId = useAddressStore((s) => s.defaultId)
  const addressLoading = useAddressStore((s) => s.loading)
  const addressDef = defaultAddress(addressList, addressDefaultId)
  const appLanguage = useSettingsStore((s) => s.language)
  const settingsLoading = useSettingsStore((s) => s.loading)
  const summary = ratingSummary(useSettingsStore((s) => s.ratings))
  const helpLoading = useHelpStore((s) => s.loading)
  const helpResolved = resolvedCount(useHelpStore((s) => s.votes))
  const faqTotal = useHelpStore((s) => s.faqs).length
  const notificationLoading = useNotificationStore((s) => s.loading)
  const unreadNotifications = unreadCount(useNotificationStore((s) => s.readIds))

  const rows = [
    {
      icon: iconOrder,
      label: 'My Order',
      to: '/orders',
      valueLoading: ordersPending,
      value: ongoingOrders > 0 ? `${ongoingOrders} 单进行中` : '暂无订单',
    },
    { icon: iconProfile, label: 'My Profile', to: '/my-profile' },
    {
      icon: iconFavorite,
      label: 'Wishlist',
      to: '/favorites',
      valueLoading: favoritesPending,
      value: (favoriteTotal ?? 0) > 0 ? `${favoriteTotal} 件收藏` : '暂无收藏',
    },
    {
      icon: iconVoucher,
      label: 'My Voucher',
      to: '/vouchers',
      valueLoading: vouchersPending,
      value:
        voucherRows.length > 0
          ? `${voucherRows.length} 张可用`
          : nextGap === Infinity
            ? '暂无可用券'
            : `还差 $${nextGap.toFixed(2)} 可用`,
    },
    {
      icon: iconAddress,
      label: 'My Address',
      to: '/addresses',
      valueLoading: addressLoading,
      value: addressDef ? `默认 ${addressDef.label} · ${addressList.length} 个` : '未设置地址',
    },
    {
      icon: iconNotification,
      label: 'Notification',
      to: '/notifications',
      valueLoading: notificationLoading,
      value: unreadNotifications > 0 ? `${unreadNotifications} 条未读` : '已全部读',
    },
    {
      icon: iconHelp,
      label: 'Help Center',
      to: '/help',
      valueLoading: helpLoading,
      value: `${helpResolved}/${faqTotal} 已解决`,
    },
    {
      icon: iconSetting,
      label: 'Setting',
      to: '/settings',
      valueLoading: settingsLoading,
      value: summary ? `评分 ${summary.average.toFixed(1)}★ · ${languageLabel(appLanguage)}` : languageLabel(appLanguage),
    },
    ...(isAdmin
      ? [{ icon: iconAdmin, label: '运营中台', to: '/admin', value: '轮播 / 类目 / 发品' }]
      : []),
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[116px] overflow-x-clip">
      <div className="sticky top-0 z-10 bg-white pt-[54px] pb-[14px] px-[33px] flex items-center gap-[22px]">
        <img className="w-[59px] h-[59px] rounded-full object-cover" src={avatar} alt={userName} />
        <span className="text-base font-medium text-black">Hi, {userName}</span>
      </div>

      <nav className="mt-[12px] px-[33px]">
        {rows.map((row, i) => (
          <div key={row.label}>
            <MenuRow onNavigate={navigate} {...row} />
            {i < rows.length - 1 && <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />}
          </div>
        ))}
      </nav>

      <div className="mt-[24px] px-[28px]">
        <button
          className="flex items-center justify-center gap-[19px] w-[208px] h-[52px] rounded-[40px] bg-[#f9f8f6] border-none cursor-pointer hover:brightness-95"
          type="button"
          onClick={handleLogout}
        >
          <img className="w-5 h-5" src={iconLogout} alt="" />
          <span className="text-base font-bold text-black">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default Profile
