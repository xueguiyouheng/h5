import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ResultSheet from '../components/ResultSheet'
import { Skeleton } from '../components/Skeleton'
import { moneyLabel } from '../api'
import { queryPayment } from '../payment'

// 结果页只读服务端状态：渠道回调可能晚于落地页到达，轮询到终态为止
const POLL_MS = 2000

// 结果面板每个支付单在一次会话里只弹一次：点过按钮或关掉它之后，浏览器返回重新进本页不该再弹
function shownFlag(paymentId) {
  return `payment-result-shown:${paymentId}`
}

function wasShown(paymentId) {
  if (!paymentId) return false
  try {
    return window.sessionStorage.getItem(shownFlag(paymentId)) === '1'
  } catch {
    return false
  }
}

function markShown(paymentId) {
  if (!paymentId) return
  try {
    window.sessionStorage.setItem(shownFlag(paymentId), '1')
  } catch {
    // 隐私模式写不进去，最坏是返回时再弹一次，不影响结果本身
  }
}

function PaymentResult() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const paymentId = params.get('payment_id') ?? ''
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')
  const [stalled, setStalled] = useState('')
  // 面板弹过一次就记账：浏览器返回会重新挂载本页，回来时不该再打扰
  const [handled, setHandled] = useState(() => wasShown(paymentId))

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
  // 只认终态：pending 期间弹窗会把还在等回调的用户提前吓走
  const terminal =
    Boolean(problem) || Boolean(stalled) || (Boolean(payment) && payment.status !== 'pending')
  const showSheet = terminal && !handled
  // fail_reason 存的是渠道回传的状态码，给人看的文案在这里出，原始码留在页面上给排障用
  const summary = problem || (succeeded
    ? `订单 ${payment.order_no} 已完成支付`
    : '没有拿到收款结果，订单仍未支付，可稍后在订单页查看')
  const statusLabel = terminal ? (succeeded ? '支付已完成' : '支付未完成') : '支付结果确认中...'

  // 弹出即记账，同一会话里再进本页（浏览器返回）不会自动弹第二次
  useEffect(() => {
    if (showSheet) markShown(paymentId)
  }, [showSheet, paymentId])

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

      {showSheet && succeeded && (
        <ResultSheet
          tone="success"
          title="Payment successful"
          description={summary}
          primaryLabel="查看我的订单"
          onPrimary={() => navigate('/orders')}
          secondaryLabel="返回商城"
          onSecondary={() => navigate('/shop')}
          onClose={() => setHandled(true)}
          closeLabel="稍后再看"
        />
      )}
      {showSheet && !succeeded && (
        <ResultSheet
          tone="failed"
          title="Payment not completed"
          description={summary}
          primaryLabel="返回商城"
          onPrimary={() => navigate('/shop')}
          secondaryLabel="查看我的订单"
          onSecondary={() => navigate('/orders')}
          onClose={() => setHandled(true)}
          closeLabel="稍后再看"
        />
      )}

      {/* 面板关掉或本次会话已弹过：出路挪到页面里，不能让结果页变成死胡同 */}
      {terminal && !showSheet && (
        <div className="mt-[28px] px-[30px]">
          <button
            className="w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold tracking-[-0.24px] leading-5 text-white cursor-pointer hover:brightness-110 active:brightness-90"
            type="button"
            onClick={() => navigate(succeeded ? '/orders' : '/shop')}
          >
            {succeeded ? '查看我的订单' : '返回商城'}
          </button>
          <button
            className="mx-auto mt-[24px] block w-fit border-none bg-none p-0 cursor-pointer font-[inherit] text-base font-bold tracking-[-0.24px] leading-5 text-black"
            type="button"
            onClick={() => navigate(succeeded ? '/shop' : '/orders')}
          >
            {succeeded ? '返回商城' : '查看我的订单'}
          </button>
        </div>
      )}
    </div>
  )
}

export default PaymentResult
