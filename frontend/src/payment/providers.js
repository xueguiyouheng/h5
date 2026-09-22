// 支付模块的渠道清单：结算页的支付方式选择与收银台标题共用这一份，避免两处各写一遍
export const PROVIDERS = [
  { id: 'alipay', label: 'Alipay', mark: '支付宝', markClass: 'bg-[#1677ff]' },
  { id: 'wechat', label: 'WeChat Pay', mark: '微信', markClass: 'bg-[#07c160]' },
]

/** 按渠道 id 取展示信息，未知渠道回落到第一条而不是崩在空白上 */
export function providerMeta(id) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}
