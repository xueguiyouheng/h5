import { create } from 'zustand'
import * as accountApi from '../api'

export const GENDERS = ['Male', 'Female', 'Other']

export function formatMobile(raw) {
  const digits = String(raw).replace(/\D/g, '')
  if (!digits.startsWith('60')) return digits
  const local = digits.slice(2)
  if (local.length < 7) return `+60 ${local}`
  return `+60 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 9)}`
}

export function passwordStrength(pw) {
  const score = [pw.length >= 8, pw.length >= 12, /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length
  if (score <= 2) return { key: 'weak', label: '弱', className: 'text-[#f50000]' }
  if (score === 3) return { key: 'medium', label: '中', className: 'text-[#b6bbb9]' }
  if (score === 4) return { key: 'strong', label: '强', className: 'text-[#00b861]' }
  return { key: 'very-strong', label: '非常强', className: 'text-[#00b861]' }
}

// 即时反馈用的规则，最终以接口返回的 message 为准
const RULES = {
  username: (v) => {
    const value = v.trim().replace(/\s+/g, ' ')
    if (value.length < 3 || value.length > 24) return { error: '姓名需 3-24 个字符' }
    if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(value)) return { error: '姓名只能包含字母、空格和 . - ' }
    return { value }
  },
  mobile: (v) => {
    const digits = v.replace(/\D/g, '')
    if (!digits.startsWith('60') || digits.length < 11 || digits.length > 13) {
      return { error: '请输入大马手机号，如 60123456789' }
    }
    return { value: digits }
  },
  gender: (v) => (GENDERS.includes(v) ? { value: v } : { error: '请选择性别' }),
  email: (v) => {
    const value = v.trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? { value } : { error: '邮箱格式不正确' }
  },
  password: (v) => (v.length < 8 ? { error: '密码至少 8 位' } : { value: v }),
}

export function validateProfileField(key, raw) {
  const rule = RULES[key]
  if (!rule) return { value: raw }
  return rule(String(raw))
}

const PROFILE_KEYS = ['username', 'mobile', 'gender', 'email', 'password']

export function profileCompleteness(profile) {
  const done = PROFILE_KEYS.filter((key) => !validateProfileField(key, profile[key] ?? '').error).length
  return { done, total: PROFILE_KEYS.length, percent: Math.round((done / PROFILE_KEYS.length) * 100) }
}

// 密码接口要求带原密码，因此这里只保留掩码，不落地明文
const PASSWORD_MASK = '••••••••'

export const useProfileStore = create((set) => ({
  username: '',
  mobile: '',
  gender: '',
  email: '',
  password: '',
  id: '',
  avatar: '',
  onboarded: false,
  isAdmin: false,
  loading: false,
  error: '',

  load: async () => {
    set({ loading: true, error: '' })
    try {
      const member = await accountApi.fetchProfile()
      set({ ...member, password: PASSWORD_MASK, loading: false })
      return member
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  setField: async (key, value) => {
    set({ [key]: value })
    if (key === 'password') return value
    const payload = key === 'gender' ? { gender: String(value).toLowerCase() } : { [key]: value }
    try {
      const member = await accountApi.updateProfile(payload)
      set({ ...member, password: PASSWORD_MASK })
      return member
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  // 改密码需要原密码，页面补充输入框后调用
  changePassword: async (nextPassword, oldPassword) => {
    const member = await accountApi.updateProfile({ password: nextPassword, old_password: oldPassword })
    set({ ...member, password: PASSWORD_MASK })
    return member
  },

  // 引导页完成后端标记，只在未登录过引导时调用
  completeOnboarding: async () => {
    await accountApi.completeOnboarding()
    set({ onboarded: true })
  },

  clearLocal: () =>
    set({
      username: '',
      mobile: '',
      gender: '',
      email: '',
      password: '',
      id: '',
      avatar: '',
      onboarded: false,
      isAdmin: false,
      error: '',
    }),
}))
