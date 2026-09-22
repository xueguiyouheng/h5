import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import BackIcon from '../../components/BackIcon'
import { useGoBack } from '../../hooks/useGoBack'

const NAV_ITEMS = [
  { path: '/admin', label: '概览', exact: true },
  { path: '/admin/orders', label: '订单处理' },
  { path: '/admin/carousel', label: '轮播配置' },
  { path: '/admin/categories', label: '类目管理' },
  { path: '/admin/products', label: '商品管理' },
  { path: '/admin/media', label: '素材库' },
]

function isActive(pathname, item) {
  if (item.exact) return pathname === item.path
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

function currentLabel(pathname) {
  const matched = NAV_ITEMS.filter((item) => isActive(pathname, item))
  return matched[matched.length - 1]?.label || '运营中台'
}

function AdminLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const goBack = useGoBack()

  return (
    <div className="min-h-screen flex bg-[#f5f7fa] text-[#1f2937]">
      <aside className="hidden md:flex w-[200px] shrink-0 flex-col bg-white border-r border-[#e6e9ee]">
        <div className="px-5 py-5 border-b border-[#eef0f3]">
          <div className="text-[15px] font-semibold text-[#111827]">FreshMart</div>
          <div className="mt-0.5 text-xs text-[#8b93a1]">运营中台</div>
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="运营中台导航">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item)
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 h-9 flex items-center text-sm no-underline transition-colors hover:no-underline ${
                  active
                    ? 'bg-[#e6f8ef] font-medium text-[#00894a]'
                    : 'text-[#4b5563] hover:bg-[#f4f6f8] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-20 shrink-0 h-12 flex items-center gap-2 px-2 bg-white border-b border-[#e6e9ee]">
          <button
            type="button"
            aria-label="返回"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md border-none bg-none cursor-pointer hover:bg-[#f4f6f8]"
            onClick={goBack}
          >
            <BackIcon />
          </button>
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-[#111827] truncate">{currentLabel(pathname)}</div>
          <button
            type="button"
            className="h-8 shrink-0 px-2.5 rounded-md border border-[#d6dbe1] bg-white text-xs text-[#374151] cursor-pointer hover:bg-[#f7f8fa]"
            onClick={() => navigate('/shop')}
          >
            返回商城
          </button>
        </header>

        <header className="hidden md:flex h-14 shrink-0 items-center justify-between gap-4 px-6 bg-white border-b border-[#e6e9ee]">
          <h1 className="m-0 text-[15px] font-semibold text-[#111827]">FreshMart 运营中台</h1>
          <button
            type="button"
            className="h-8 px-3 rounded-md border border-[#d6dbe1] bg-white text-[13px] text-[#374151] cursor-pointer hover:bg-[#f7f8fa]"
            onClick={() => navigate('/shop')}
          >
            返回商城
          </button>
        </header>
        <main className="flex-1 p-4 pb-24 min-w-0 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="运营中台移动端导航"
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex bg-white border-t border-[#e6e9ee] pb-[env(safe-area-inset-bottom)]"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 h-14 flex flex-col items-center justify-center gap-1 text-[11px] no-underline hover:no-underline ${
                active ? 'text-[#00894a] font-medium' : 'text-[#8b93a1]'
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${active ? 'bg-[#00b861]' : 'bg-transparent'}`} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default AdminLayout
