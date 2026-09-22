import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import CheckBox from '../components/CheckBox'
import { Skeleton } from '../components/Skeleton'
import { useCartStore, parsePrice } from '../stores/cartStore'

function CartRowSkeleton() {
  return (
    <div className="flex items-center gap-3 h-[90px]" aria-hidden="true">
      <Skeleton className="shrink-0 h-4 w-4 rounded-[4px]" />
      <Skeleton className="shrink-0 w-[70px] h-[70px] rounded-[15px]" />
      <div className="flex-1 flex flex-col gap-[8px]">
        <Skeleton className="h-[16px] w-[120px] rounded" />
        <Skeleton className="h-[16px] w-[72px] rounded" />
      </div>
      <Skeleton className="shrink-0 h-8 w-[76px] rounded-full" />
    </div>
  )
}

function CartRow({ item }) {
  const setQty = useCartStore((s) => s.setQty)
  const toggleSelect = useCartStore((s) => s.toggleSelect)
  const lineTotal = (parsePrice(item.price) * item.qty).toFixed(2)

  return (
    <div className="flex items-center gap-3 h-[90px]">
      <CheckBox
        id={`select-${item.id}`}
        checked={item.selected}
        onChange={() => toggleSelect(item.id)}
        label={`Select ${item.name}`}
      />
      <div className="relative shrink-0 w-[70px] h-[70px] bg-[#f9f8f6] rounded-[15px] overflow-hidden">
        <img
          className="absolute inset-0 m-auto max-h-[48px] max-w-[48px] object-contain pointer-events-none"
          src={item.image}
          alt={item.name}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-5 text-black truncate">{item.name}</div>
        <div className="mt-[7px] text-[15px] font-medium leading-5 text-black">{item.price}</div>
        <div className="mt-px text-xs leading-4 text-[#b6bbb9]">小计 ${lineTotal}</div>
      </div>
      <div className="shrink-0 flex items-center h-8 rounded-full border border-[#e4e4e4] bg-white">
        <button
          type="button"
          aria-label={`Decrease ${item.name} quantity`}
          disabled={item.qty <= 1}
          onClick={() => setQty(item.id, item.qty - 1)}
          className="flex items-center justify-center w-7 h-full border-none bg-none p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M0 4 H8" stroke="#000" strokeWidth="1.2" />
          </svg>
        </button>
        <span className="w-5 text-center text-sm font-medium leading-5 text-black tabular-nums">
          {item.qty}
        </span>
        <button
          type="button"
          aria-label={`Increase ${item.name} quantity`}
          onClick={() => setQty(item.id, item.qty + 1)}
          className="flex items-center justify-center w-7 h-full border-none bg-none p-0 cursor-pointer"
        >
          <svg width="9" height="8" viewBox="0 0 9 8" aria-hidden="true">
            <path d="M0 4 H8 M4.5 0 V8" stroke="#000" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onClick={() => setQty(item.id, 0)}
        className="shrink-0 border-none bg-none p-0 cursor-pointer text-base leading-none text-[#b6bbb9]"
      >
        ×
      </button>
    </div>
  )
}

function Cart() {
  const navigate = useNavigate()
  const items = useCartStore((s) => s.items)
  const loading = useCartStore((s) => s.loading)
  const payable = useCartStore((s) => s.payable)
  const deliveryFee = useCartStore((s) => s.deliveryFee)
  const selectAll = useCartStore((s) => s.selectAll)
  const totalPrice = useCartStore((s) => s.totalPrice)
  const selectedCount = items.filter((i) => i.selected).length
  const allSelected = items.length > 0 && selectedCount === items.length

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[186px] overflow-x-clip">
      <PageHeader title="Cart" size="sm" back={false} />

      {loading && items.length === 0 ? (
        <div className="mt-4 px-[29px]">
          {Array.from({ length: 3 }, (_, i) => (
            <CartRowSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center pt-[200px]">
          <p className="text-sm text-[#b6bbb9]">购物车还是空的</p>
          <button
            className="mt-4 px-6 h-9 rounded-full bg-[#00b861] border-none text-sm text-white cursor-pointer"
            type="button"
            onClick={() => navigate('/shop')}
          >
            去逛逛
          </button>
        </div>
      ) : (
        <div className="mt-4 px-[29px]">
          {items.map((item) => (
            <CartRow key={item.id} item={item} />
          ))}
          <div className="mt-1 h-px bg-[#eeeeee]" />
          <div className="mt-4 flex items-center justify-between text-sm text-[#b6bbb9]">
            <div className="flex items-center gap-2">
              <CheckBox
                id="select-all"
                checked={allSelected}
                onChange={() => selectAll(!allSelected)}
                label="Select all"
              />
              <label htmlFor="select-all" className="cursor-pointer">
                全选 ({items.length} 件)
              </label>
            </div>
            <span>
              合计 <span className="text-base font-medium text-black">${totalPrice().toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      <div className="fixed bottom-[56px] left-1/2 -translate-x-1/2 w-full max-w-[480px] h-[111px] bg-white border-t border-[#f4f5f7] flex flex-col items-start gap-[6px] px-[29px] pt-[16px]">
        {selectedCount > 0 && deliveryFee > 0 && (
          <p className="m-0 text-xs leading-4 text-[#b6bbb9]">含运费 ${deliveryFee.toFixed(2)}</p>
        )}
        <button
          className="w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold text-white cursor-pointer hover:brightness-110 active:brightness-90 disabled:bg-[#e4e4e4] disabled:cursor-not-allowed"
          type="button"
          disabled={selectedCount === 0}
          onClick={() => navigate('/checkout')}
        >
          {selectedCount > 0 ? `Checkout · $${payable.toFixed(2)}` : 'Checkout'}
        </button>
      </div>
    </div>
  )
}

export default Cart
