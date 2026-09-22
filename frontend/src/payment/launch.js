// 唤起执行器：后端发指令（launch.kind），浏览器这边怎么动只认这一份代码
// form/redirect 会让页面跳走，结果由服务端回调写入，落地页再查回来；jsapi/qrcode 留在本页，靠轮询收敛

/**
 * 执行一次唤起。
 * @param {object} launch 后端 payment.Launch
 * @returns {Promise<'left' | 'success' | 'failed' | 'pending'>} left 表示页面已跳走，调用方不用再管结果
 */
export async function applyLaunch(launch) {
  switch (launch.kind) {
    case 'form':
      submitForm(launch)
      return 'left'
    case 'redirect':
      window.location.href = launch.url
      return 'left'
    case 'jsapi':
      return invokeWechat(launch.jsapi)
    case 'qrcode':
      // 二维码已经展示在收银台上，等用户手机扫码，调用方转入轮询
      return 'pending'
    default:
      throw new Error('不支持的支付方式')
  }
}

// 支付宝手机网站支付：把已签好名的字段填进隐藏表单提交到网关
function submitForm(launch) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = launch.action
  for (const [name, value] of Object.entries(launch.fields || {})) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value == null ? '' : String(value)
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

// 微信内置浏览器：参数已由服务端二次签名，回调里的 err_msg 是用户侧结果的唯一线索
function invokeWechat(params) {
  if (!params) throw new Error('缺少微信支付唤起参数')
  return new Promise((resolve) => {
    function call() {
      window.WeixinJSBridge.invoke('getBrandWCPayRequest', params, (res) => {
        const msg = String(res?.err_msg || '')
        if (msg.indexOf('ok') >= 0) resolve('success')
        else if (msg.indexOf('cancel') >= 0) resolve('failed')
        else resolve('pending')
      })
    }
    if (window.WeixinJSBridge) call()
    else document.addEventListener('WeixinJSBridgeReady', call, { once: true })
  })
}
