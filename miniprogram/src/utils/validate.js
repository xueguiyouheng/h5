// 表单校验：从 frontend/src/stores/profileStore.js 与 pages/Register.jsx 各移植一份（决策 8：各端一份，不共用代码）
// 规则必须与后端 services/member_service.go 一致，端上只是即时反馈，最终以接口返回的 message 为准

const MOBILE_RE = /^1[3-9]\d{9}$/

/** 大陆号段按 3-4-4 分组展示；不合规的号码原样返回，不做伪装改写 */
export function formatMobile(raw) {
  const digits = String(raw).replace(/\D/g, '')
  if (!MOBILE_RE.test(digits)) return digits
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
}

/** 密码强度：tone 对应 index.scss 里的 .strength--* 修饰类 */
export function passwordStrength(pw) {
  const value = String(pw)
  const score = [value.length >= 8, value.length >= 12, /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length
  if (score <= 2) return { label: '弱', tone: 'weak' }
  if (score === 3) return { label: '中', tone: 'medium' }
  if (score === 4) return { label: '强', tone: 'strong' }
  return { label: '非常强', tone: 'strong' }
}

/** 归一 + 校验，返回 { value } 或 { error }，与 H5 的 validateProfileField 同形状 */
const RULES = {
  username: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if (value.length < 3 || value.length > 24) return { error: '姓名需 3-24 个字符' }
    if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(value)) return { error: '姓名只能包含字母、空格和 . - ' }
    return { value }
  },
  email: (v) => {
    const value = v.trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? { value } : { error: '邮箱格式不正确' }
  },
  password: (v) => (v.length < 8 ? { error: '密码至少 8 位' } : { value: v }),
  mobile: (v) => {
    // 与后端 NormalizeMobile 同口径：只留数字，13 位且 86 开头视为带国家码
    let digits = v.replace(/\D/g, '')
    if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
    if (!MOBILE_RE.test(digits)) return { error: '请输入 11 位中国大陆手机号，如 13800138000' }
    return { value: digits }
  },
  // 门店是卖家的发货店址，与买家账号下的收货地址是两份数据
  store_name: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if ([...value].length < 2 || [...value].length > 30) return { error: '门店名称需 2-30 个字符' }
    return { value }
  },
  store_address: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if ([...value].length < 6) return { error: '门店至少 6 个字符，写清街道与城市' }
    return { value }
  },
}

export function validateField(key, raw) {
  const rule = RULES[key]
  if (!rule) return { value: raw }
  return rule(String(raw))
}
