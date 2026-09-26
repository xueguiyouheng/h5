import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import QueryError from '../components/QueryError'
import { Skeleton } from '../components/Skeleton'
import { useCartStore } from '../stores/cartStore'
import { useRedeemVoucher, useVouchers } from '../hooks/useShopData'

function VoucherCard({ voucher, cartTotal, onUse }) {
  const usable = cartTotal >= voucher.minSpend
  const lines = voucher.title.split('\n')
  const hint = usable
    ? voucher.kind === 'percent'
      ? `可用 省$${((cartTotal * voucher.value) / 100).toFixed(2)}`
      : '可用 免运费'
    : `差 $${(voucher.minSpend - cartTotal).toFixed(2)}`

  return (
    <div className="relative h-[99px] rounded-[10px] bg-[#f9f8f6]">
      <span className="absolute left-[75px] -top-[10px] w-5 h-5 rounded-full bg-white" aria-hidden="true" />
      <span className="absolute left-[75px] -bottom-[10px] w-5 h-5 rounded-full bg-white" aria-hidden="true" />
      <span className="absolute left-[85px] top-[10px] h-[79px] border-l border-dashed border-[#dcdcdc]" aria-hidden="true" />

      <div className="absolute left-0 top-0 flex h-full w-[85px] flex-col items-center justify-center">
        {lines.map((line) => (
          <span
            key={line}
            className={`font-medium leading-6 text-[#00b861] ${voucher.kind === 'percent' ? 'text-[25px]' : 'text-base'}`}
          >
            {line}
          </span>
        ))}
        <span className={`mt-1 px-1 text-center text-[8px] leading-3 ${usable ? 'text-[#00b861]' : 'text-[#b6bbb9]'}`}>
          {hint}
        </span>
      </div>

      <button
        className="absolute left-[116px] top-[18px] w-[174px] border-none bg-none p-0 text-left cursor-pointer"
        type="button"
        onClick={onUse}
        aria-label={`Use voucher: ${voucher.description}`}
      >
        <span className="block text-[10px] leading-[18px] text-black">{voucher.description}</span>
        <span className="mt-[5px] block text-[8px] leading-6 font-medium text-[#fb4e4e]">
          Expired date : {voucher.expiredAt}
        </span>
      </button>
    </div>
  )
}

function VoucherCardSkeleton() {
  return (
    <div className="flex h-[99px] items-center gap-[31px] rounded-[10px] bg-[#f9f8f6] pl-[16px]" aria-hidden="true">
      <Skeleton className="h-[44px] w-[54px] rounded" />
      <div className="flex flex-col gap-[8px]">
        <Skeleton className="h-[14px] w-[174px] rounded" />
        <Skeleton className="h-[12px] w-[110px] rounded" />
      </div>
    </div>
  )
}

function MyVoucher() {
  const navigate = useNavigate()
  const cartTotal = useCartStore((s) => s.totalPrice())
  const { data, isPending, isError, error, refetch } = useVouchers()
  const redeem = useRedeemVoucher()
  const [code, setCode] = useState('')
  const vouchers = data ?? []

  function apply() {
    redeem.mutate(code, { onSuccess: () => setCode('') })
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="My Voucher" />

      <div className="mt-4 px-[30px]">
        <div className="flex items-center gap-3">
          <input
            className="h-[39px] min-w-0 flex-1 rounded-[15px] border-none bg-[#f8f8f8] px-[23px] text-sm leading-5 text-black outline-none placeholder:text-[#7a869a]/50"
            type="text"
            placeholder="Enter voucher code"
            aria-label="Voucher code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
          <button
            className="h-[39px] w-[84px] shrink-0 rounded-[15px] border-none bg-[#00b861] text-sm font-medium leading-5 text-white cursor-pointer hover:brightness-110 active:brightness-90 disabled:bg-[#e4e4e4] disabled:cursor-not-allowed"
            type="button"
            disabled={redeem.isPending || code.trim().length === 0}
            onClick={apply}
          >
            {redeem.isPending ? '...' : 'Apply'}
          </button>
        </div>
        {redeem.error && (
          <p className="m-0 mt-2 text-[10px] leading-4 text-[#fb4e4e]">{redeem.error.message}</p>
        )}
        {redeem.data && (
          <p className="m-0 mt-2 text-[10px] leading-4 text-[#00b861]">
            兑换成功，已加入券包
          </p>
        )}
      </div>

      <div className="mt-10 px-[30px] space-y-7">
        {isError && vouchers.length === 0 && <QueryError error={error} onRetry={refetch} />}
        {isPending &&
          Array.from({ length: 3 }, (_, i) => <VoucherCardSkeleton key={i} />)}
        {vouchers.map((voucher) => (
          <VoucherCard key={voucher.id} voucher={voucher} cartTotal={cartTotal} onUse={() => navigate('/cart')} />
        ))}
        {!isPending && !isError && vouchers.length === 0 && (
          <p className="m-0 py-[24px] text-center text-sm leading-6 text-[#b6bbb9]">暂无可用优惠券，输入兑换码领取</p>
        )}
      </div>
    </div>
  )
}

export default MyVoucher
