// 支付结果轮询：本端只此一份实现，收银台与结果页共用，避免两处对「什么时候算终态」给出不同答案
// 铁律与 H5 一致：支付结果只认服务端，前端拿到渠道回调成功也不自行判成功，仍以查询为准
import { useEffect, useRef, useState } from 'react'
import { queryPayment } from './api'

// 渠道回调通常几秒内到，再快也只是空转
const POLL_MS = 3000

function secondsLeft(expiredAt) {
  if (!expiredAt) return 0
  const left = new Date(expiredAt).getTime() - Date.now()
  return left > 0 ? Math.floor(left / 1000) : 0
}

/**
 * 轮询支付单到终态为止。
 * @param {string} paymentId 支付单 ID，为空时不发请求
 * @param {object} options active 关掉可以停在当前结果上；onSettled 在拿到终态时回调一次
 * @returns {{payment: object|null, error: string, timedOut: boolean, secondsLeft: number, refresh: function}}
 */
export function usePaymentStatus(paymentId, { active = true, onSettled } = {}) {
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const [nonce, setNonce] = useState(0)
  // 上层每次渲染都会换回调引用，用 ref 取最新的，轮询区间才不会被打断
  const settledRef = useRef(onSettled)

  useEffect(() => {
    settledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    if (!paymentId || !active) return undefined
    let cancelled = false
    let timer = 0
    const tick = async () => {
      try {
        const doc = await queryPayment(paymentId)
        if (cancelled) return
        setPayment(doc)
        if (doc.status !== 'pending') {
          if (settledRef.current) settledRef.current(doc)
          return
        }
        // 服务端在读取时惰性关单，本地也判一次超时，别把轮询打到天荒地老
        if (secondsLeft(doc.expired_at) > 0) timer = setTimeout(tick, POLL_MS)
        else setTimedOut(true)
      } catch (err) {
        if (!cancelled) setError((err && err.message) || '支付结果查询失败')
      }
    }
    timer = setTimeout(tick, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [paymentId, active, nonce])

  return {
    payment,
    error,
    timedOut,
    secondsLeft: payment ? secondsLeft(payment.expired_at) : 0,
    refresh: () => setNonce((n) => n + 1),
  }
}

export { secondsLeft as paymentSecondsLeft }
