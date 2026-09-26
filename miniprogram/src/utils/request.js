// 传输层：H5 的 axios 在这里换成 Taro.request，其余口径与 H5 一致
// 1) 后端统一信封 {code,message,data}，非 2xx 一律抛 Error(message)，页面只 catch 一个错误
// 2) 凭证用 Bearer 头而不是 Cookie —— 小程序没有浏览器的 cookie jar，
//    后端 CSRF 中间件对 bearer 载体放行（P2a），所以这一层不需要 X-CSRF-Token
// 3) X-Client 显式声明发起端，后端支付选产品只认它不认 UA
import Taro from '@tarojs/taro'
import { PLATFORM } from './env'

const API_BASE = __API_BASE__
const BASE_URL = `${API_BASE}/api`

// 换端只改 env.js 一处：支付宝小程序走 mp_alipay，后端据此选收款产品
const CLIENT = PLATFORM

const TOKEN_KEY = 'fm_member_token'
const LOGIN_PATH = '/miniprogram/wechat/login'

export function getToken() {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token) {
  Taro.setStorageSync(TOKEN_KEY, token || '')
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
}

/** 未授权手机号：后端此时不发令牌，客户端要拉起平台授权后重试 */
export class NeedsPhoneAuth extends Error {
  constructor() {
    super('需要授权手机号才能继续')
    this.name = 'NeedsPhoneAuth'
  }
}

// 没有身份就没有门店，商城侧一切取数都锁在门店上，所以这个错误等于「该去登录了」：
// 直接把页面交给登录页，而不是停在一屏「去登录」等人再点一次
// 支付结果页不跳：那一屏显示的是钱到没到账，弹走人就再也回不来这笔结论了
const NO_JUMP_ROUTES = ['pages/login/index', 'pages/register/index', 'pages/payment-result/index']
let toLoginPending = false

function goToLogin() {
  if (toLoginPending) return
  const pages = Taro.getCurrentPages()
  const route = pages.length ? pages[pages.length - 1].route || '' : ''
  if (NO_JUMP_ROUTES.indexOf(route) >= 0) return
  toLoginPending = true
  Taro.reLaunch({ url: '/pages/login/index' }).finally(() => {
    toLoginPending = false
  })
}

/** 闸门按钮也走这一个口：两套跳法只会各坏一半 */
export function gotoLogin() {
  goToLogin()
}

/**
 * 素材地址补全：后端只存相对路径（/uploads/xxx），H5 靠同源解析，小程序没有同源概念
 * 已是绝对地址或本地临时文件（真机上传预览）时原样返回
 */
export function absAsset(url) {
  if (!url) return ''
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('wxfile://') || url.startsWith('http://tmp/')) return url
  return API_BASE + (url.charAt(0) === '/' ? url : `/${url}`)
}

function toQuery(params) {
  if (!params) return ''
  const parts = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  })
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * 裸请求：不发令牌也不做重登重试，登录链路自己用（否则 401 重试会递归）
 * @returns {Promise<{status:number, body:object}>}
 */
export async function rawRequest(method, path, { data, params, withToken = false } = {}) {
  if (!API_BASE) throw new Error('接口地址未配置：本地预览跑 npm run preview:weapp，正式构建要带 FM_API_BASE')
  const header = { 'Content-Type': 'application/json', 'X-Client': CLIENT }
  const token = getToken()
  if (withToken && token) header.Authorization = `Bearer ${token}`
  const res = await Taro.request({
    url: BASE_URL + path + toQuery(params),
    method,
    data: data || undefined,
    header,
    timeout: 15000,
  })
  const body = res.data && typeof res.data === 'object' ? res.data : {}
  return { status: res.statusCode, body }
}

// wx.login 的 code 一次有效，重登必须重新取
export function platformLogin() {
  return new Promise((resolve, reject) => {
    Taro.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('平台没有返回登录凭证'))),
      fail: () => reject(new Error('平台登录失败，请稍后重试')),
    })
  })
}

/** 授权登录端点的唯一出口：交平台凭证换令牌并落本地存储，422 表示还没拿到手机号授权 */
export async function loginWith(payload) {
  const { status, body } = await rawRequest('POST', LOGIN_PATH, { data: payload })
  if (status === 422) throw new NeedsPhoneAuth()
  if (status < 200 || status >= 300) throw new Error(body.message || '登录失败')
  const issued = (body.data || {}).token || ''
  if (!issued) throw new Error('登录响应里没有令牌')
  setToken(issued)
  return issued
}

let pendingSession = null

/**
 * 静默登录：openid 已绑过就能直接拿到令牌；未绑时后端回 422，抛 NeedsPhoneAuth 让页面出授权入口
 * 并发调用共用同一次请求，避免冷启动时几个页面同时打登录接口把 code 用重
 */
export function ensureSession() {
  const token = getToken()
  if (token) return Promise.resolve(token)
  if (!pendingSession) {
    pendingSession = platformLogin()
      .then((code) => loginWith({ code }))
      .finally(() => {
        pendingSession = null
      })
  }
  return pendingSession
}

/** 令牌失效（后端换了签名密钥 / 过期）：清掉重走一次，仍失败就把页面交给授权态 */
async function relogin() {
  clearToken()
  return ensureSession()
}

async function sendOnce(method, path, { data, params } = {}) {
  await ensureSession()
  let { status, body } = await rawRequest(method, path, { data, params, withToken: true })
  if (status === 401) {
    await relogin()
    ;({ status, body } = await rawRequest(method, path, { data, params, withToken: true }))
  }
  if (status === 401) throw new NeedsPhoneAuth()
  if (status >= 400) throw new Error(body.message || `请求失败（${status}）`)
  const code = body.code || status
  if (code >= 200 && code < 300) return body.data
  throw new Error(body.message || '请求失败')
}

async function send(method, path, options = {}) {
  try {
    return await sendOnce(method, path, options)
  } catch (err) {
    if (err instanceof NeedsPhoneAuth) goToLogin()
    throw err
  }
}

/**
 * 平台上传通道：小程序没有 FormData，素材上传只能走 Taro.uploadFile
 * 字段名与后端约定一致（file），回参结构与 H5 收到的 {code,message,data} 相同
 */
export async function uploadFile(path, filePath, { name = 'file', formData } = {}) {
  await ensureSession()
  const header = { 'X-Client': CLIENT }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`
  const res = await Taro.uploadFile({
    url: BASE_URL + path,
    filePath,
    name,
    formData,
    header,
    timeout: 30000,
  })
  let body = res.data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      throw new Error('上传响应无法解析')
    }
  }
  body = body || {}
  if (res.statusCode >= 400) throw new Error(body.message || `上传失败（${res.statusCode}）`)
  return body.code >= 200 && body.code < 300 ? body.data : Promise.reject(new Error(body.message || '上传失败'))
}

// 与 H5 的 axios 同形，api/index.js 才能整文件移植过来一行不改
const request = {
  get: (path, config = {}) => send('GET', path, config),
  post: (path, data, config = {}) => send('POST', path, { ...config, data }),
  put: (path, data, config = {}) => send('PUT', path, { ...config, data }),
  patch: (path, data, config = {}) => send('PATCH', path, { ...config, data }),
  delete: (path, config = {}) => send('DELETE', path, { data: config.data }),
}

export default request
