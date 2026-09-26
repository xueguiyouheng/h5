// 支付模块对外出口：页面只从本文件引入，模块内部怎么拆分不与调用方耦合
// 契约与 H5 一致：prepay 建单 → launch 拿唤起指令 → 留在本页轮询 → 结果以查询为准
export { prepay, queryPayment, launchPayment, mockConfirm, isMockPayment } from './api'
export { applyLaunch } from './launch'
export { PROVIDERS, providerMeta } from './providers'
export { usePaymentStatus, paymentSecondsLeft } from './usePaymentStatus'

export { default as PaymentSheet } from './components/PaymentSheet'
