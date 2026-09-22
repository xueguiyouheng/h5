import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ResultSheet from '../components/ResultSheet'
import { Skeleton } from '../components/Skeleton'
import { moneyLabel } from '../api'
import { queryPayment } from '../payment'

// 结果页只读服务端状态：渠道回调可能晚于落地页到达，轮询到终态为止
const POLL_MS = 2000

function PaymentResult() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const paymentId = params.get('payment_id') ?? ''
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')
  const [stalled, setStalled] = useState('')

  useEffect(() => {
    if (!paymentId) return undefined
    let cancelled = false
    let timer = 0
    const tick = async () => {
      try {
        const doc = await queryPayment(paymentId)
        if (cancelled) return
        setPayment(doc)
        if (doc.status !== 'pending') return
        // 后端在读取时惰性关单，这里本地也判一次，超时后不再空轮询
        if (new Date(doc.expired_at).getTime() > Date.now()) timer = window.setTimeout(tick, POLL_MS)
        else setStalled('支付已超时，订单未收到款项')
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    timer = window.setTimeout(tick, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [paymentId])

  const succeeded = payment?.status === 'success'
  // 没有支付单号时不发请求，链接本身就有问题
  const missing = !paymentId
  const problem = missing ? '链接里没有支付单号，无法确认结果' : error
  const ready = Boolean(payment) || Boolean(problem)
  // fail_reason 存的是渠道回传的状态码，给人看的文案在这里出，原始码留在页面上给排障用
  const summary = problem || (succeeded
    ? `订单 ${payment.order_no} 已完成支付`
    : '没有拿到收款结果，订单仍未支付，可稍后在订单页查看')
  const statusLabel = payment ? (succeeded ? '支付已完成' : '支付未完成') : '支付结果确认中...'

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="Payment" size="sm" />
      <div className="mt-[18px] px-[30px]">
        {!ready ? (
          <div className="flex flex-col gap-[14px]">
            <Skeleton className="h-[35px] w-[160px] rounded" />
            <Skeleton className="h-[16px] w-full rounded" />
          </div>
        ) : (
          <>
            <div className="text-[26px] font-medium leading-[35px] text-[#181d2d] tabular-nums">
              {payment ? moneyLabel(payment.amount, payment.currency) : '--'}
            </div>
            <div className="mt-[6px] text-xs leading-4 text-[#b6bbb9] break-all">
              {payment ? `${payment.order_no} · ${payment.provider}` : ''}
            </div>
            <div className="mt-[20px] text-sm leading-5 text-[#202020]">{statusLabel}</div>
            <div className="mt-[6px] text-[11px] leading-[14px] text-[#b6bbb9] break-all">{stalled || payment?.fail_reason}</div>
          </>
        )}
      </div>

      {ready && succeeded && (
        <ResultSheet
          tone="success"
          title="Payment successful"
          description={summary}
          primaryLabel="查看我的订单"
          onPrimary={() => navigate('/orders')}
          secondaryLabel="返回商城"
          onSecondary={() => navigate('/shop')}
        />
      )}
      {ready && !succeeded && (
        <ResultSheet
          tone="failed"
          title="Payment not completed"
          description={summary}
          primaryLabel="返回商城"
          onPrimary={() => navigate('/shop')}
          secondaryLabel="查看我的订单"
          onSecondary={() => navigate('/orders')}
        />
      )}
    </div>
  )
}

export default PaymentResult
