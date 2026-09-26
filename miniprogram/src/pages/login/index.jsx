import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import {
  bindWechatIdentity,
  clearSignedOutMark,
  loginWithPassword,
  loginWithPhone,
  wasSignedOut,
} from '../../utils/auth'
import { alignStoreByLocation, withDeadline } from '../../utils/shop'
import { NeedsPhoneAuth, ensureSession, getToken } from '../../utils/request'
import './index.scss'

const DEV_CODE_KEY = 'fm_dev_platform_code'

/**
 * 模拟渠道按 code 派生 openid，而真机每次冷启动的 code 都不同，
 * 于是同一个人每次进来都是「新微信用户」，手机号会被判成已绑定其他微信。
 * 开发环境把 code 固定下来，模拟身份才稳定；生产构建里这段不存在
 */
function devPlatformCode() {
  const saved = Taro.getStorageSync(DEV_CODE_KEY)
  if (saved) return saved
  const generated = 'devcode-' + Date.now()
  Taro.setStorageSync(DEV_CODE_KEY, generated)
  return generated
}

function enterApp() {
  clearSignedOutMark()
  // 落店要在进首页之前做完（首页各块都按门店取数），但它卡住时不能把人关在商城外，所以限时
  withDeadline(alignStoreByLocation(), 4000)
    .then((name) => name && Taro.showToast({ title: `已切到 ${name}`, icon: 'none' }))
    .catch(() => {})
    .finally(() => Taro.reLaunch({ url: '/pages/home/index' }))
}

/**
 * 注册页把邮箱当 URL 参数带过来。编码与否由端的版本决定（`@` 会变成 %40），
 * 预填错一位就是「用户名或密码错误」，所以不管框架解没解过都再解一次
 */
function initialAccount(raw) {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * 登录：这一屏是小程序的 pages[0]，未登录的人不会先看到带 tabBar 的空商城
 * 进来先静默试一次登录（openid 绑过就直接进首页，人无感）；试不出身份才露出表单。
 * 主路径是账号密码，手机号/邮箱/用户名都能当账号（后端 FindByAccount 三种都认），
 * 这样在网页端注册过的老账号不依赖微信授权也进得来。
 * 微信授权手机号是另一条路径——没有账号的人一键注册并合并
 */
export default function Login() {
  const router = useRouter()
  const [account, setAccount] = useState(initialAccount(router.params.account))
  const [password, setPassword] = useState('')
  const [tip, setTip] = useState('')
  const [busy, setBusy] = useState(false)
  const [mockPhone, setMockPhone] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // 刚退出的人要留在这一屏，不能再被静默登录原样送回去
    if (wasSignedOut()) {
      setChecking(false)
      return
    }
    // 本地有令牌就直接走，不必等网络
    if (getToken()) {
      Taro.reLaunch({ url: '/pages/home/index' })
      return
    }
    // 静默登录限时：游客 appid 下 wx.login 可能不回调，表单不能因此永远露不出来
    withDeadline(ensureSession(), 3000)
      .then(() => Taro.reLaunch({ url: '/pages/home/index' }))
      .catch(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <View className="page">
        <Text className="tip">正在登录…</Text>
      </View>
    )
  }

  const signIn = async () => {
    if (busy) return
    const value = account.trim()
    if (!value || !password) {
      setTip('请输入账号和密码')
      return
    }
    setBusy(true)
    setTip('')
    try {
      await loginWithPassword(value, password)
      // 顺手把这个账号绑到当前微信上，下次冷启动才能静默登录。
      // 这一步不等它：游客 appid 下 wx.login 可能不回调，等等于把已经登录成功的人扣在这一屏
      withDeadline(bindWechatIdentity(), 4000).catch(() => {})
      enterApp()
    } catch (err) {
      setTip(err.message)
    } finally {
      setBusy(false)
    }
  }

  const submitAuth = async ({ phoneCode, code }) => {
    if (busy) return
    setBusy(true)
    setTip('')
    try {
      await loginWithPhone({ phoneCode, code })
      enterApp()
    } catch (err) {
      // 同号已绑其他微信这类冲突要留在本页让人换号，不能弹回首页反复试
      setTip(err instanceof NeedsPhoneAuth ? '授权已取消，可重试' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const onGetPhoneNumber = (e) => {
    const phoneCode = (e.detail || {}).code || ''
    if (!phoneCode) {
      setTip('没有拿到授权凭证，请重试')
      return
    }
    submitAuth({ phoneCode })
  }

  return (
    <View className="page">
      <View className="brand">FreshMart</View>
      <View className="headline">登录后继续你的订单</View>
      <View className="sub">收货地址、购物车与订单都记在同一个账号下</View>

      <View className="form">
        <Input
          className="input"
          type="text"
          maxlength="32"
          placeholder="手机号 / 邮箱 / 用户名"
          value={account}
          onInput={(e) => setAccount(e.detail.value)}
        />
        <Input
          className="input"
          type="text"
          password
          placeholder="密码"
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />
        <Button className="primary" loading={busy} onClick={signIn}>
          登录
        </Button>
      </View>

      {/* 与 H5 登录页同一句提示：账号就是网页端那一个，手机号即凭据 */}
      <View className="foot">
        <Text className="foot__ask">测试账号 admin / admin123</Text>
      </View>

      <View className="foot">
        <Text className="foot__ask">还没有账号？</Text>
        <Text className="foot__link" onClick={() => Taro.navigateTo({ url: '/pages/register/index' })}>
          注册
        </Text>
      </View>

      <View className="divider">
        <Text className="divider__text">或使用</Text>
      </View>

      <Button className="auth-btn" openType="getPhoneNumber" onGetPhoneNumber={onGetPhoneNumber} loading={busy}>
        微信授权手机号登录
      </Button>

      {/* 平台授权码要有真实 appid 与手机号资质才拿得到；本地 mock 渠道接受把号码直接当授权码传，
          这样资质办下来之前整条合并链路能在开发环境跑完。生产构建里这段不存在 */}
      {process.env.NODE_ENV === 'development' && (
        <View className="dev">
          <Text className="dev__label">开发环境模拟授权</Text>
          <Input
            className="dev__input"
            type="number"
            maxlength="11"
            placeholder="填入已在网页端注册的大陆手机号"
            value={mockPhone}
            onInput={(e) => setMockPhone(e.detail.value)}
          />
          <Button className="dev__btn" disabled={busy || mockPhone.length !== 11} onClick={() => submitAuth({ phoneCode: mockPhone, code: devPlatformCode() })}>
            以该号码完成授权
          </Button>
        </View>
      )}

      {tip && <View className="tip">{tip}</View>}
    </View>
  )
}
