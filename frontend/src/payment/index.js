// 支付模块对外出口：页面只从本文件引入，模块内部怎么拆分不与调用方耦合
// 契约：prepay 建单 → launch 拿唤起指令 → 跳渠道或留在本页轮询 → 支付结果以 queryPayment 为准
export { prepay, queryPayment, launchPayment } from './api'
export { applyLaunch } from './launch'
export { PROVIDERS, providerMeta } from './providers'

import PaymentSheet from './components/PaymentSheet'

export { PaymentSheet }
