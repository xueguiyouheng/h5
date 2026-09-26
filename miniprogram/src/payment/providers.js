// 支付渠道清单：结算页的支付方式选择与收银台标题共用这一份，避免两处各写一遍
// 渠道按端裁剪：微信 JSAPI 的 appid 必须与 openid 同源，
// 在微信小程序里挂出支付宝等于给用户一个必然下单失败的选项，宁可只留一个
import { PLATFORM } from '../utils/env'

const PROVIDERS_BY_PLATFORM = {
  mp_wechat: [{ id: 'wechat', label: '微信支付', mark: '微信', markClass: 'pay-mark--wechat' }],
  // 支付宝小程序的 tradeno 形态在 P2f 落地后才算可用，届时后端按端回不同 kind
  mp_alipay: [{ id: 'alipay', label: '支付宝', mark: '支付宝', markClass: 'pay-mark--alipay' }],
}

export const PROVIDERS = PROVIDERS_BY_PLATFORM[PLATFORM] || []

/** 按渠道 id 取展示信息，未知渠道回落到本端第一个而不是崩在空白上 */
export function providerMeta(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}
