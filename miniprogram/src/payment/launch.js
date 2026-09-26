// 唤起执行器：后端发指令（launch.kind），本端怎么动只认这一份代码
// 移植自 frontend/src/payment/launch.js，换的是「执行手段」不是契约：
// 浏览器能整页跳转，小程序只有 wx.requestPayment，所以 form / redirect 在本端属于走不通的形态，
// 明确报错比悄悄挂着强——静默会让用户停在收银台上以为支付卡住了
import Taro from '@tarojs/taro'

/**
 * 执行一次唤起。
 * @param {object} launch 后端 payment.Launch
 * @returns {Promise<'left' | 'success' | 'failed' | 'pending'>} left 表示已离开本页，调用方不用再管结果
 */
export async function applyLaunch(launch) {
  switch (launch.kind) {
    case 'jsapi':
      return invokeWechatPay(launch.jsapi)
    case 'qrcode':
      // 本端不展示二维码：模拟渠道用这一形态表达「已挂起，等结果」，调用方转入轮询
      return 'pending'
    case 'form':
    case 'redirect':
      throw new Error('该支付方式需要在浏览器中完成，请改用微信支付')
    default:
      throw new Error('不支持的支付方式')
  }
}

// 微信收款弹窗：参数已由服务端按小程序 appid 签好，端上只做透传
// 取消与失败要分开判：errMsg 里的 cancel 是用户主动放弃，订单还在待支付；其余按未知处理，交回轮询裁决
function invokeWechatPay(params) {
  if (!params) return Promise.reject(new Error('缺少微信支付唤起参数'))
  return new Promise((resolve) => {
    Taro.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: () => resolve('pending'),
      fail: (err) => resolve(String((err || {}).errMsg || '').indexOf('cancel') >= 0 ? 'failed' : 'pending'),
    })
  })
}
