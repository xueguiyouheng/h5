// 发起端标识只在这里判定一次：请求头的 X-Client 与支付渠道裁剪都读它
// 两处各写一遍 TARO_ENV 判断，改端时必然漂移成一个账号两种行为
const PLATFORM = process.env.TARO_ENV === 'alipay' ? 'mp_alipay' : 'mp_wechat'

export { PLATFORM }
