import { useEffect, useRef, useState } from 'react'
import { moneyLabel } from '../../api'
import { launchPayment, queryPayment } from '../api'
import { applyLaunch } from '../launch'
import { providerMeta } from '../providers'

const EXIT_MS = 320
// 渠道没把页面带走时（扫码 / JSAPI）靠轮询收敛，3 秒一次足够，再快也只是空转
const POLL_MS = 3000

function secondsLeft(expiredAt) {
  const left = new Date(expiredAt).getTime() - Date.now()
  return left > 0 ? Math.floor(left / 1000) : 0
}

function mmss(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 收银台：点「唤起支付」拿一条 launch 指令再交给 applyLaunch，
 * 页面跳走时结果由渠道回调写服务端、落地页查回来；留在本页（扫码 / JSAPI）时这里轮询支付单。
 * 支付结果永远以服务端为准，前端不自行判定成功。
 * 取消回传 'cancel'：订单已建好但没付款，交回上层给续付入口。
 */
function PaymentSheet({ payment, onResult }) {
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [launch, setLaunch] = useState(null)
  const [left, setLeft] = useState(() => secondsLeft(payment.expired_at))
  const resultRef = useRef(onResult)

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30)
    return () => clearTimeout(timer)
  }, [])

  // 上层每次渲染都换回调，用 ref 取最新的，轮询区间才不会被打断
  useEffect(() => {
    resultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setLeft(secondsLeft(payment.expired_at)), 1000)
    return () => clearInterval(timer)
  }, [payment.expired_at])

  // 只有没跳走的情况才需要自己收敛结果；拿到终态或本地判超时都交回上层
  useEffect(() => {
    if (!waiting) return undefined
    const timer = setInterval(async () => {
      try {
        const doc = await queryPayment(payment.id)
        if (doc.status === 'success') {
          setWaiting(false)
          resultRef.current('success')
        } else if (doc.status !== 'pending') {
          setWaiting(false)
          // fail_reason 是渠道状态码，不适合直接给用户看，这里只回文案
          resultRef.current('failed', '支付未完成，订单仍然待支付')
        } else if (secondsLeft(doc.expired_at) <= 0) {
          setWaiting(false)
          resultRef.current('failed', '支付已超时，请重新发起')
        }
      } catch (err) {
        setWaiting(false)
        resultRef.current('failed', err.message)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, payment.id])

  const provider = providerMeta(payment.provider)
  const expired = left <= 0

  function cancel() {
    if (closing || busy) return
    setClosing(true)
    setShown(false)
    setTimeout(() => onResult('cancel'), EXIT_MS)
  }

  // outcome 只有模拟渠道会用；真实渠道的收款结果由用户在渠道侧决定，这里传什么都不影响
  async function go(outcome) {
    if (busy || expired || waiting) return
    setBusy(true)
    setError('')
    try {
      const doc = await launchPayment(payment.id, outcome)
      setLaunch(doc)
      const stayed = await applyLaunch(doc)
      if (stayed !== 'left') setWaiting(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const qrContent = launch?.qr_content || payment.qr_content

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${provider.label} checkout`}
    >
      <div
        className={`absolute inset-0 bg-[rgba(29,35,53,0.51)] transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={busy || waiting ? undefined : cancel}
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
        <div className="flex items-center justify-between">
          <span className="text-base font-medium leading-5 text-[#181d2d]">Pay with {provider.label}</span>
          <span
            className={`shrink-0 flex items-center justify-center h-[22px] px-[8px] rounded-[6px] text-[11px] font-medium leading-none text-white ${provider.markClass}`}
          >
            {provider.mark}
          </span>
        </div>

        <div className="mt-[18px] text-center">
          <span className="text-[26px] font-medium leading-[35px] text-[#181d2d] tabular-nums">
            {moneyLabel(payment.amount, payment.currency)}
          </span>
          <div className="mt-[6px] text-xs leading-4 text-[#b6bbb9]">
            {expired ? '支付已超时，请重新发起' : `请在 ${mmss(left)} 内完成支付`}
          </div>
        </div>

        {/* 扫码位：桌面端的正式出路，模拟渠道下是同一结构的假二维码 */}
        <div className="mx-auto mt-[20px] flex h-[168px] w-[168px] flex-col items-center justify-center gap-[8px] rounded-[15px] border border-dashed border-[#d8d8d8] bg-[#f9f8f6] px-[10px] text-center">
          <span className="text-[11px] font-medium leading-none tracking-[1px] text-[#b6bbb9]">
            {payment.mock_credential ? 'MOCK QR' : '扫码支付'}
          </span>
          <span className="break-all text-[9px] leading-[12px] text-[#8b8b8b]">{qrContent}</span>
        </div>

        <div className="mt-[14px] text-center text-[11px] leading-[14px] text-[#b6bbb9] break-all">
          {payment.order_no} · {payment.mock_credential}
        </div>

        {error && <p className="m-0 mt-[12px] text-center text-xs leading-4 text-[#f50000]">{error}</p>}

        <button
          className="mt-[22px] w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold tracking-[-0.24px] leading-5 text-white cursor-pointer hover:brightness-110 active:brightness-90 disabled:bg-[#e4e4e4] disabled:cursor-not-allowed"
          type="button"
          disabled={busy || expired || waiting}
          onClick={() => go('success')}
        >
          {waiting ? '等待支付结果...' : '唤起支付'}
        </button>
        {payment.mock_credential && (
          <button
            className="mx-auto mt-[18px] block w-fit border-none bg-none p-0 cursor-pointer font-[inherit] text-sm font-bold leading-5 text-[#202020] disabled:cursor-not-allowed disabled:text-[#b6bbb9]"
            type="button"
            disabled={busy || expired || waiting}
            onClick={() => go('failed')}
          >
            唤起支付（模拟失败）
          </button>
        )}
        <button
          className="mx-auto mt-[10px] block w-fit border-none bg-none p-0 cursor-pointer font-[inherit] text-sm leading-5 text-[#b6bbb9]"
          type="button"
          disabled={busy}
          onClick={cancel}
        >
          取消支付
        </button>
      </div>
    </div>
  )
}

export default PaymentSheet
