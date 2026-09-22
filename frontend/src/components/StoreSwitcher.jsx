import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import iconArrowDown from '../assets/shop/icon-arrow-down.svg'
import QueryError from '../components/QueryError'
import { SkeletonListRows } from '../components/Skeleton'
import { currentStore, useShopsStore } from '../stores/shopsStore'
import { useCartStore } from '../stores/cartStore'

const EXIT_MS = 320

const CHIP = 'shrink-0 rounded-full bg-[#00b861]/10 px-[6px] text-[8px] leading-[14px] text-[#00b861]'
const SIDE_TEXT = 'shrink-0 text-[10px] leading-4 text-[#b6bbb9]'

function StoreRow({ store, isCurrent, pending, onSelect }) {
  return (
    <button
      className="flex w-full items-center gap-3 border-none bg-none py-[12px] pl-0 pr-0 text-left cursor-pointer font-[inherit]"
      type="button"
      disabled={isCurrent}
      onClick={() => onSelect(store.id)}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-[6px] text-sm font-medium leading-5 text-black">
          <span className="truncate">{store.name}</span>
          {isCurrent && <span className={CHIP}>当前门店</span>}
        </span>
        <span className="mt-[2px] truncate text-[10px] leading-4 tracking-[-0.24px] text-[#8b8b8b]">
          {store.address || '该门店未填地址'}
          {store.outOfRange && ' · 超出配送范围'}
        </span>
      </span>
      {pending ? (
        <span className={SIDE_TEXT}>切换中</span>
      ) : (
        store.distanceText && <span className={SIDE_TEXT}>{store.distanceText}</span>
      )}
    </button>
  )
}

function StoreSheet({ onClose }) {
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const [pendingId, setPendingId] = useState('')
  const [locating, setLocating] = useState(false)
  const list = useShopsStore((s) => s.list)
  const located = useShopsStore((s) => s.located)
  const loading = useShopsStore((s) => s.loading)
  const error = useShopsStore((s) => s.error)
  const load = useShopsStore((s) => s.load)
  const relocate = useShopsStore((s) => s.relocate)
  const select = useShopsStore((s) => s.select)
  const queryClient = useQueryClient()

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function dismiss() {
    if (closing) return
    setClosing(true)
    setShown(false)
    setTimeout(onClose, EXIT_MS)
  }

  async function selectStore(id) {
    if (pendingId) return
    setPendingId(id)
    try {
      await select(id)
      // 换店等于换了数据归属：列表、购物车全部重取，否则看到的是上一家店的商品与购物车
      queryClient.invalidateQueries()
      await useCartStore.getState().load()
      dismiss()
    } catch {
      setPendingId('')
    }
  }

  async function sortByDistance() {
    setLocating(true)
    await relocate()
    setLocating(false)
  }

  // 面板挂在 header 的 z-10 stacking context 里会被 tabbar 压住，Portal 到 body
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label="切换门店">
      <div
        className={`absolute inset-0 bg-[rgba(29,35,53,0.51)] transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        className={`absolute bottom-0 w-full max-w-[480px] bg-white rounded-t-[35px] px-[30px] pt-[28px] pb-[34px] transition-transform motion-reduce:transition-none ${
          closing
            ? 'duration-[320ms] ease-[cubic-bezier(0.66,0,1,1)]'
            : 'duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
        }`}
        style={{ transform: shown ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <h2 className="m-0 text-center text-base font-medium leading-6 text-black">切换门店</h2>

        {!located && (
          <button
            className="mt-[10px] w-full border-none bg-none p-0 text-center text-[10px] leading-[14px] text-[#00b861] cursor-pointer"
            type="button"
            disabled={locating}
            onClick={sortByDistance}
          >
            {locating ? '定位中…' : '按我的位置排序'}
          </button>
        )}

        <div className="mt-[18px] flex flex-col divide-y divide-[#f4f5f7]">
          {loading && list.length === 0 && (
            <SkeletonListRows count={2} padding="py-[12px] pl-0 pr-0" avatar="h-[38px] w-[38px] rounded-[12px]" line="w-full" />
          )}
          {!loading && error && <QueryError className="py-[12px]" error={{ message: error }} onRetry={load} />}
          {!loading && !error && list.length === 0 && (
            <p className="m-0 py-[12px] text-sm leading-5 text-[#b6bbb9]">附近还没有可选择的门店</p>
          )}
          {list.map((store) => (
            <StoreRow
              key={store.id}
              store={store}
              isCurrent={store.current}
              pending={pendingId === store.id}
              onSelect={selectStore}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// 门店 = 卖家的店，切换写回 /api/shop/stores/selection，之后所有数据归属这家店
export default function StoreSwitcher() {
  const pathname = useLocation().pathname
  const [openedOn, setOpenedOn] = useState(null)
  const list = useShopsStore((s) => s.list)
  const loading = useShopsStore((s) => s.loading)
  const load = useShopsStore((s) => s.load)
  const store = currentStore(list)
  // 面板 Portal 在 body 上，首页被 tab 隐藏时不会跟着消失，所以只在进入它的那条路由上算打开
  const open = openedOn === pathname

  useEffect(() => {
    if (list.length > 0 || loading) return
    load().catch(() => {})
  }, [list.length, loading, load])

  return (
    <>
      <button
        className="flex h-6 items-center gap-1 border-none bg-none p-0 cursor-pointer font-[inherit]"
        type="button"
        aria-label="切换门店"
        onClick={() => setOpenedOn(pathname)}
      >
        <span className="text-base font-medium text-black">{store ? store.name : '选择门店'}</span>
        <img src={iconArrowDown} alt="" width="17" height="17" />
      </button>
      {open && <StoreSheet onClose={() => setOpenedOn(null)} />}
    </>
  )
}
