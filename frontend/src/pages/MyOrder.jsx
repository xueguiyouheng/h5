import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import QueryError from '../components/QueryError'
import { Skeleton } from '../components/Skeleton'
import { ORDER_STATUS_META } from '../constants/orderStatus'
import { useOrders } from '../hooks/useShopData'

const TABS = [
  { key: 'ongoing', label: 'On going' },
  { key: 'history', label: 'History' },
]

function statusMeta(status) {
  return ORDER_STATUS_META[status] ?? { label: status, icon: 'dot' }
}

function StatusIcon({ status }) {
  const { icon } = statusMeta(status)
  if (icon === 'dot') {
    return (
      <span className="relative flex w-4 h-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-[#08c25e]/10" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#08c25e]" />
      </span>
    )
  }
  return <img className="w-4 h-4 shrink-0" src={icon} alt="" aria-hidden="true" />
}

function OrderCard({ order }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-[11px]">
          <span className="text-xs leading-4 text-black/60">Date</span>
          <span className="text-xs leading-4 text-black/90 tabular-nums">{order.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon status={order.status} />
          <span className="text-xs leading-4 text-black">{statusMeta(order.status).label}</span>
        </div>
      </div>
      <div className="mt-6 flex items-start justify-between">
        <div>
          <div className="text-[10px] leading-[13px] text-black/60">Deliver to</div>
          <div className="mt-[3px] text-sm font-medium leading-[18px] text-black">{order.address}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] leading-[13px] text-black/60">Total Payment</div>
          <div className="mt-[3px] text-sm font-medium leading-[18px] text-black tabular-nums">
            ${order.total.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="mt-5 h-px bg-[#f4f5f7]" aria-hidden="true" />
    </div>
  )
}

function OrderCardSkeleton() {
  return (
    <div className="pb-[20px]" aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-[14px] w-[120px] rounded" />
        <Skeleton className="h-[14px] w-[64px] rounded" />
      </div>
      <div className="mt-6 flex items-start justify-between">
        <div className="flex flex-col gap-[6px]">
          <Skeleton className="h-[12px] w-[52px] rounded" />
          <Skeleton className="h-[16px] w-[150px] rounded" />
        </div>
        <div className="flex flex-col items-end gap-[6px]">
          <Skeleton className="h-[12px] w-[72px] rounded" />
          <Skeleton className="h-[16px] w-[56px] rounded" />
        </div>
      </div>
      <div className="mt-5 h-px bg-[#f4f5f7]" />
    </div>
  )
}

function MyOrder() {
  const [tab, setTab] = useState('ongoing')
  const {
    data, isPending, isError, error, refetch,
    hasNextPage, isFetchingNextPage, isPlaceholderData, sentinelRef,
  } = useOrders(tab)
  const orders = data?.items ?? []
  const shownTotal = orders.reduce((sum, o) => sum + o.total, 0)

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="My Order" />

      <div className="mt-4 flex items-start gap-[5px] px-[16px]">
        {TABS.map((item) => {
          const active = item.key === tab
          return (
            <button
              key={item.key}
              className="flex flex-col items-center pt-[10px] border-none bg-none cursor-pointer"
              type="button"
              aria-pressed={active}
              onClick={() => setTab(item.key)}
            >
              <span
                className={`text-sm leading-[25px] ${active ? 'text-[#00b861]' : 'text-[#b6bbb9]'}`}
              >
                {item.label}
              </span>
              <span
                className={`mt-[7px] h-px w-[31px] rounded-full ${active ? 'bg-[#00b861]' : 'bg-transparent'}`}
                aria-hidden="true"
              />
            </button>
          )
        })}
        {orders.length > 0 && (
          <span className="ml-auto self-center text-[10px] leading-4 text-[#b6bbb9] tabular-nums">
            {orders.length} 单 · ${shownTotal.toFixed(2)}
          </span>
        )}
      </div>

      <div className="mt-[38px] px-[27px]">
        {isError && orders.length === 0 && <QueryError error={error} onRetry={refetch} />}
        {isPending && (
          <div>
            {Array.from({ length: 3 }, (_, i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        )}
        {!isPending && orders.length === 0 && !isError && (
          <p className="m-0 text-sm text-center text-[#b6bbb9]">
            {tab === 'ongoing' ? '暂无进行中的订单' : '暂无历史订单'}
          </p>
        )}
        {orders.length > 0 && (
          <>
            {/* 切 tab 时先显示上一批并压暗，新数据到了再换回来，避免整片闪白 */}
            <div
              className={
                'space-y-5 transition-opacity duration-200 ' +
                (isPlaceholderData ? 'opacity-50' : 'opacity-100')
              }
            >
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-px" aria-hidden="true" />
            {isFetchingNextPage &&
              Array.from({ length: 2 }, (_, i) => <OrderCardSkeleton key={i} />)}
            {!hasNextPage && !isPlaceholderData && !isFetchingNextPage && (
              <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default MyOrder
