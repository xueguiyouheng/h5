// 会话装配：手机号授权登录、账号密码登录与身份绑定
// 手机号是唯一合并主键，只认平台下发的授权凭证（phone_code），用户在输入框里手填的号码不作数
// 静默登录与令牌读写在 utils/request.js，这里只管「要用户填/点」的三条路径
import Taro from '@tarojs/taro'
import { platformLogin, rawRequest, loginWith, getToken, setToken, clearToken } from './request'

const SIGNED_OUT_KEY = 'fm_signed_out'

/**
 * 账号密码登录：账号可以是手机号、邮箱或用户名（后端 FindByAccount 三种都认）
 * /api/login 在 CSRF 豁免清单里且此刻还没有令牌，所以能直接裸调；令牌自己落盘
 * @returns {Promise<string>} 令牌
 */
export async function loginWithPassword(account, password) {
  const { status, body } = await rawRequest('POST', '/login', { data: { username: account, password } })
  if (status < 200 || status >= 300) throw new Error(body.message || '登录失败')
  const issued = (body.data || {}).token || ''
  if (!issued) throw new Error('登录响应里没有令牌')
  setToken(issued)
  return issued
}

/**
 * 手机号授权登录：code 换 openid，phone_code 换平台侧号码，服务端按号码合并已有账号或新建
 * @param {string} phoneCode 平台 getPhoneNumber 回调里的 code
 * @param {string} [code] 仅开发环境的模拟授权用：真实链路一定要走 platformLogin 取平台 code
 */
export async function loginWithPhone({ phoneCode, code }) {
  const platformCode = code || (await platformLogin())
  return loginWith({ code: platformCode, phone_code: phoneCode })
}

/**
 * 把当前登录会员绑到这台微信上：密码登录后调一次，之后冷启动即可静默登录
 * 只交 code，openid 由服务端重新换取——客户端自报等于允许挂别人的收款身份
 */
export async function bindWechatIdentity() {
  if (!getToken()) throw new Error('请先登录')
  const code = await platformLogin()
  const { status, body } = await rawRequest('POST', '/miniprogram/bind', { data: { code }, withToken: true })
  if (status < 200 || status >= 300) throw new Error(body.message || '绑定失败')
  return true
}

/**
 * 退出登录：除了清令牌还要记一笔，否则登录页那一次静默登录会把绑过的微信原样登回去，退出等于没退出
 */
export function signOut() {
  clearToken()
  Taro.setStorageSync(SIGNED_OUT_KEY, '1')
}

export function wasSignedOut() {
  return Taro.getStorageSync(SIGNED_OUT_KEY) === '1'
}

/** 这一次是人主动要进来的，退出标记到此为止 */
export function clearSignedOutMark() {
  Taro.removeStorageSync(SIGNED_OUT_KEY)
}
