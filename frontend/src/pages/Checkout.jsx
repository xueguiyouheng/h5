import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import QueryError from '../components/QueryError'
import ResultSheet from '../components/ResultSheet'
import { Skeleton, SkeletonCards } from '../components/Skeleton'
import iconDelivery from '../assets/checkout/icon-delivery.svg'
import { PROVIDERS, PaymentSheet, prepay } from '../payment'
import { useCheckoutPreview } from '../hooks/useShopData'
import { defaultAddress, formatAddressLines, useAddressStore } from '../stores/addressStore'
import { useCartStore } from '../stores/cartStore'

function SectionTitle({ children, className = '' }) {
  return (
    <h2 className={`m-0 text-base font-medium leading-5 text-[#172b4d] ${className}`}>{children}</h2>
  )
}

function PaymentOption({ payment, checked, onSelect }) {
  return (
    <label className="relative flex h-[48px] items-center gap-[20px] rounded-[12px] bg-[#f9f8f6] pl-[20px] pr-[16px] cursor-pointer">
      <input
        type="radio"
        name="payment-method"
        value={payment.id}
        checked={checked}
        onChange={onSelect}
        aria-label={payment.label}
        className="absolute h-px w-px opacity-0"
      />
      <span
        className={`flex shrink-0 items-center justify-center h-4 w-4 rounded-full border bg-white ${
          checked ? 'border-black' : 'border-[#9d9ea3]'
        }`}
        aria-hidden="true"
      >
        {checked && <span className="h-2 w-2 rounded-full bg-black" />}
      </span>
      <span className="text-sm leading-4 text-[#202020]">{payment.label}</span>
      <span
        className={`ml-auto shrink-0 flex items-center justify-center h-[22px] px-[8px] rounded-[6px] text-[11px] font-medium leading-none text-white ${payment.markClass}`}
      >
        {payment.mark}
      </span>
    </label>
  )
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'text-lg font-medium leading-6 text-[#202020]' : 'text-base leading-[22px] text-[#9d9ea3]'}>
        {label}
      </span>
      <span className={strong ? 'text-lg font-medium leading-6 text-[#202020] tabular-nums' : 'text-base leading-[23px] text-[#202020] tabular-nums'}>
        {value}
      </span>
    </div>
  )
}

function Checkout() {
  const navigate = useNavigate()
  const items = useCartStore((s) => s.items)
  const loading = useCartStore((s) => s.loading)
  const loadCart = useCartStore((s) => s.load)
  const placeOrder = useCartStore((s) => s.placeOrder)
  const loadAddresses = useAddressStore((s) => s.load)
  const addresses = useAddressStore((s) => s.list)
  const defaultId = useAddressStore((s) => s.defaultId)
  const [payment, setPayment] = useState('alipay')
  const [placing, setPlacing] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [result, setResult] = useState('')
  // 下单成功即持有订单，支付失败后重试不会二次下单（库存与券在下单时已被占用）
  const [order, setOrder] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [pay, setPay] = useState(null)

  useEffect(() => {
    loadCart().catch(() => {})
    loadAddresses().catch(() => {})
  }, [loadCart, loadAddresses])

  const itemIds = items.filter((i) => i.selected).map((i) => i.id)
  const { data: preview, isPending, isError, error, refetch } = useCheckoutPreview({
    addressId: defaultId ?? '',
    itemIds,
    enabled: itemIds.length > 0,
  })
  // 下单会清空购物车行项目，试算随之失去入参；存下用户确认过的那份金额，续付期间页面才不会变空壳
  const summary = preview ?? (order ? snapshot : null)
  const previewLoading = isPending && !summary

  const address = summary?.address ?? defaultAddress(addresses, defaultId)
  const addressLines = address ? formatAddressLines(address.detail) : []
  const canPay = !!address && !placing

  // 下单 → 建支付单 → 拉起模拟收银台；支付结果再决定弹成功还是失败面板
  async function submit() {
    setPlacing(true)
    setOrderError('')
    try {
      if (!order) setSnapshot(preview ?? null)
      const placed = order ?? (await placeOrder({ addressId: address.id, paymentMethod: payment }))
      setOrder(placed)
      const doc = await prepay({ orderId: placed.id, provider: payment })
      setPay({ order: placed, payment: doc })
    } catch (err) {
      setOrderError(err.message)
      setResult('failed')
    } finally {
      setPlacing(false)
    }
  }

  // 结果由收银台观察得到（轮询到终态或渠道回调），这里只负责收尾展示，不再自行发起支付
  // 页面被渠道带走的情形不会走到这里，落地页 /payment/result 接管结果
  function onPayResult(outcome, message) {
    setPay(null)
    if (outcome === 'cancel') {
      // 订单已经建好，只是没有付款：留在这里等用户续付，不能掉回空态
      setResult('canceled')
      return
    }
    if (outcome === 'success') {
      setResult('success')
      return
    }
    setOrderError(message || '支付未完成，订单仍然待支付')
    setResult('failed')
  }

  // 下单结果面板：成功后购物车已被服务端清空，这里保留订单号供「Track Order」定位
  const paid = result === 'success'
  const sheet =
    paid ? (
      <ResultSheet
        tone="success"
        title="Thank you for your order"
        description="Your items has been placed and is on it’s way to being processed"
        primaryLabel="Track Order"
        onPrimary={() => navigate('/orders')}
        secondaryLabel="Back to Home"
        onSecondary={() => navigate('/shop')}
      />
    ) : result === 'canceled' ? (
      <ResultSheet
        tone="failed"
        title="Payment canceled"
        description={`订单 ${order?.order_no ?? ''} 已下单，尚未支付`}
        primaryLabel="Continue to pay"
        onPrimary={() => {
          setResult('')
          submit()
        }}
        secondaryLabel="查看我的订单"
        onSecondary={() => navigate('/orders')}
        onClose={() => setResult('')}
      />
    ) : result === 'failed' ? (
      <ResultSheet
        tone="failed"
        title={order ? 'Payment not completed' : 'Order could not completed'}
        description={orderError || 'Something went wrong'}
        primaryLabel={order ? 'Continue to pay' : 'Please Try Again'}
        onPrimary={() => {
          setResult('')
          submit()
        }}
        secondaryLabel={order ? '查看我的订单' : 'Back to Home'}
        onSecondary={() => navigate(order ? '/orders' : '/shop')}
        onClose={() => setResult('')}
      />
    ) : null

  // 试算需要勾选行才能发起，所以空态必须自己收尾，不能让骨架屏一直转
  // 下单成功后购物车会被服务端清空，此时不能回退到空态，否则会闪掉支付与结果面板
  // 订单已建好但未支付（取消/失败）也要留在结算页，用户才有续付的入口
  if (itemIds.length === 0 && !order && !result && !pay && !placing) {
    const emptyCart = !loading && items.length === 0
    return (
      <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
        <PageHeader title="Checkout" size="sm" />
        {loading && items.length === 0 ? (
          <div className="mt-[18px] px-[30px]">
            <SkeletonCards count={1} />
          </div>
        ) : (
          <div className="flex flex-col items-center pt-[200px]">
            <p className="text-sm text-[#b6bbb9]">{emptyCart ? '购物车是空的' : '购物车里没有勾选商品'}</p>
            <button
              className="mt-4 px-6 h-9 rounded-full bg-[#00b861] border-none text-sm text-white cursor-pointer"
              type="button"
              onClick={() => navigate(emptyCart ? '/shop' : '/cart')}
            >
              {emptyCart ? '去逛逛' : '回购物车勾选'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[28px] overflow-x-clip">
      <PageHeader title="Checkout" size="sm" />

      <SectionTitle className="mt-[18px] px-[30px]">Delivery Address</SectionTitle>
      <div className="mt-[12px] px-[30px]">
        {previewLoading ? (
          <SkeletonCards count={1} />
        ) : address ? (
          <div className="rounded-[12px] bg-[#f9f8f6] px-[21px] pt-[14px] pb-[12px]">
            <div className="flex items-start justify-between">
              <span className="text-base font-medium leading-5 text-black">{address.label}</span>
              <button
                className="border-none bg-none p-0 cursor-pointer font-[inherit] text-base leading-5 text-black"
                type="button"
                onClick={() => navigate('/addresses')}
              >
                Change
              </button>
            </div>
            {addressLines.map((line) => (
              <div key={line} className="text-xs leading-[18px] text-[#8b8b8b]">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-[12px] bg-[#f9f8f6] px-[21px] py-[14px]">
            <span className="text-sm text-[#8b8b8b]">还没有收货地址</span>
            <button
              className="px-4 h-8 rounded-full bg-[#00b861] border-none text-sm text-white cursor-pointer"
              type="button"
              onClick={() => navigate('/addresses')}
            >
              添加地址
            </button>
          </div>
        )}
      </div>

      <SectionTitle className="mt-[39px] px-[30px]">Payment</SectionTitle>
      <div className="mt-[12px] px-[30px] flex flex-col gap-[14px]">
        {PROVIDERS.map((option) => (
          <PaymentOption
            key={option.id}
            payment={option}
            checked={option.id === payment}
            onSelect={() => setPayment(option.id)}
          />
        ))}
      </div>

      <div className="mt-[43px] px-[30px]">
        {isError ? (
          <QueryError error={error} onRetry={refetch} />
        ) : (
          <div className="flex items-center gap-[23px]">
            <img src={iconDelivery} alt="" width="32" height="32" className="shrink-0" />
            <div>
              <div className="text-base font-medium leading-5 text-black">Delivery</div>
              <div className="text-xs leading-4 text-[#b6bbb9]">
                {summary
                  ? summary.deliveryFee === 0
                    ? '本次订单免运费'
                    : `满 $${summary.freeDeliveryThreshold} 免运费，还差 $${(summary.freeDeliveryThreshold - summary.subtotal).toFixed(2)}`
                  : '满 $20 免运费'}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="m-0 mt-[33px] px-[30px] text-[13px] leading-4 text-[#b6bbb9]">
        By completing this order, I agree to all{' '}
        <button
          className="border-none bg-none p-0 cursor-pointer font-[inherit] text-[13px] leading-4 text-[#00b861]"
          type="button"
          onClick={() => navigate('/help')}
        >
          terms &amp; conditions
        </button>
      </p>

      <div className="mt-[43px] px-[30px] flex flex-col gap-[18px]">
        {previewLoading ? (
          <>
            <Skeleton className="h-[22px] w-full rounded" />
            <Skeleton className="h-[22px] w-full rounded" />
          </>
        ) : summary ? (
          <>
            <SummaryRow label="Sub-total" value={`$${summary.subtotal.toFixed(2)}`} />
            <SummaryRow label="Delivery fee" value={`$${summary.deliveryFee.toFixed(2)}`} />
            {summary.discount > 0 && <SummaryRow label="Voucher" value={`-$${summary.discount.toFixed(2)}`} />}
          </>
        ) : null}
      </div>

      <div className="mt-[18px] h-px bg-[#f4f5f7] mx-[30px]" />

      <div className="mt-[23px] px-[30px]">
        {summary && <SummaryRow label="Total Payment" value={`$${summary.payable.toFixed(2)}`} strong />}
      </div>

      {orderError && <p className="m-0 mt-[12px] px-[30px] text-xs leading-4 text-[#f50000]">{orderError}</p>}

      {!paid && order && itemIds.length === 0 && (
        <p className="m-0 mt-[12px] px-[30px] text-xs leading-4 text-[#8b8b8b]">
          订单 {order.order_no} 已创建、待支付，金额沿用下单时的试算 ·{' '}
          <button
            className="border-none bg-none p-0 cursor-pointer font-[inherit] text-xs leading-4 text-[#00b861]"
            type="button"
            onClick={() => navigate('/orders')}
          >
            查看我的订单
          </button>
        </p>
      )}

      <div className="mt-[20px] px-[30px]">
        <button
          className="w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold text-white cursor-pointer hover:brightness-110 active:brightness-90 disabled:bg-[#e4e4e4] disabled:cursor-not-allowed"
          type="button"
          disabled={!canPay}
          onClick={submit}
        >
          {placing ? '提交中...' : order ? '继续支付' : 'Continue'}
        </button>
      </div>

      {pay && <PaymentSheet payment={pay.payment} onResult={onPayResult} />}

      {sheet}
    </div>
  )
}

export default Checkout
