// 收银台：点「唤起支付」拿一条 launch 指令交给 applyLaunch，本端不会跳走，
// 结果一律由 usePaymentStatus 轮询服务端收敛——前端拿到渠道弹窗成功也不算成功
// 模拟渠道下没有真的收银台，后端回「挂起」形态，这里补一个确认层把收款结果投给既有回调
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { moneyLabel } from '../../api'
import { launchPayment, mockConfirm, isMockPayment } from '../api'
import { applyLaunch } from '../launch'
import { providerMeta } from '../providers'
import { usePaymentStatus, paymentSecondsLeft } from '../usePaymentStatus'
import './PaymentSheet.scss'

const EXIT_MS = 320

function mmss(total) {
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/**
 * @param {object} payment 支付单
 * @param {function} onResult (outcome: 'success'|'failed'|'cancel', message?: string)
 */
export default function PaymentSheet({ payment, onResult }) {
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(() => paymentSecondsLeft(payment.expired_at))

  // 结果只从轮询来：拿到终态就交回上层，本页不再判定
  const { payment: polled, timedOut } = usePaymentStatus(payment.id, {
    active: waiting,
    onSettled: (doc) => {
      setWaiting(false)
      if (doc.status === 'success') onResult('success')
      else onResult('failed', '支付未完成，订单仍然待支付')
    },
  })

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setLeft(paymentSecondsLeft(payment.expired_at)), 1000)
    return () => clearInterval(timer)
  }, [payment.expired_at])

  // 本地判超时后停止等待，别让收银台转圈到永远
  useEffect(() => {
    if (waiting && (timedOut || (polled && polled.status === 'closed'))) {
      setWaiting(false)
      onResult('failed', '支付已超时，请重新发起')
    }
  }, [waiting, timedOut, polled, onResult])

  const provider = providerMeta(payment.provider)
  const mock = isMockPayment(payment)
  // 挂起态即需要投模拟收款结果，waiting 之外不再单开一个状态位
  const confirming = mock && waiting
  const expired = left <= 0

  function cancel() {
    if (busy) return
    setShown(false)
    setTimeout(() => onResult('cancel'), EXIT_MS)
  }

  async function go(outcome) {
    if (busy || expired || waiting) return
    setBusy(true)
    setError('')
    try {
      const doc = await launchPayment(payment.id, outcome)
      const result = await applyLaunch(doc)
      if (result === 'failed') {
        onResult('failed', '支付已取消，订单仍然待支付')
        return
      }
      setWaiting(true)
    } catch (err) {
      setError((err && err.message) || '唤起支付失败')
    } finally {
      setBusy(false)
    }
  }

  // 把模拟的收款结果投给后端既有回调，之后仍由轮询收敛，收银台不自行宣布成功
  async function confirmMock(outcome) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await mockConfirm(payment.id, outcome)
    } catch (err) {
      setError((err && err.message) || '模拟回调失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className={`pay-sheet ${shown ? 'pay-sheet--shown' : ''}`}>
      <View className="pay-sheet__mask" onClick={busy || waiting ? undefined : cancel} />
      <View className="pay-sheet__panel">
        <View className="pay-sheet__head">
          <Text className="pay-sheet__title">Pay with {provider.label}</Text>
          <Text className={`pay-sheet__mark ${provider.markClass}`}>{provider.mark}</Text>
        </View>

        <View className="pay-sheet__amount">
          <Text className="pay-sheet__money">{moneyLabel(payment.amount, payment.currency)}</Text>
          <Text className="pay-sheet__countdown">
            {expired ? '支付已超时，请重新发起' : `请在 ${mmss(left)} 内完成支付`}
          </Text>
        </View>

        <Text className="pay-sheet__no">
          {payment.order_no}
          {mock ? ` · ${payment.mock_credential}` : ''}
        </Text>

        {error ? <Text className="pay-sheet__error">{error}</Text> : null}

        {confirming ? (
          <View className="pay-sheet__mock">
            <Text className="pay-sheet__mock-tip">模拟渠道：请选择这次收银台的收款结果</Text>
            <View className="pay-sheet__mock-actions">
              <Text
                className={`pay-sheet__mock-btn ${busy ? 'pay-sheet__mock-btn--dim' : ''}`}
                onClick={() => confirmMock('success')}
              >
                收款成功
              </Text>
              <Text
                className={`pay-sheet__mock-btn pay-sheet__mock-btn--weak ${busy ? 'pay-sheet__mock-btn--dim' : ''}`}
                onClick={() => confirmMock('failed')}
              >
                收款失败
              </Text>
            </View>
          </View>
        ) : (
          <Text
            className={`pay-sheet__primary ${busy || expired || waiting ? 'pay-sheet__primary--dim' : ''}`}
            onClick={() => go('success')}
          >
            {waiting ? '等待支付结果...' : '唤起支付'}
          </Text>
        )}

        <Text className={`pay-sheet__cancel ${busy ? 'pay-sheet__cancel--dim' : ''}`} onClick={cancel}>
          取消支付
        </Text>
      </View>
    </View>
  )
}
