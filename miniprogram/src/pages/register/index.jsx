import Taro from '@tarojs/taro'
import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import { registerAccount } from '../../api'
import { formatMobile, passwordStrength, validateField } from '../../utils/validate'
import { locate } from '../../utils/shop'
import './index.scss'

// 字段与 H5 的 pages/Register.jsx 一致（决策 8：各端一份，校验规则抄同一套口径）
const FIELDS = [
  { key: 'username', label: '用户名', placeholder: '3-24 个字符' },
  { key: 'email', label: '邮箱', placeholder: 'you@example.com', type: 'text' },
  { key: 'password', label: '密码', placeholder: '至少 8 位', password: true },
  { key: 'mobile', label: '手机号', placeholder: '11 位大陆手机号', digits: true },
]

const ACCOUNT_TYPES = [
  { key: 'buyer', label: '买家' },
  { key: 'merchant', label: '商家' },
]

const STORE_FIELDS = [
  { key: 'store_name', label: '门店名称', placeholder: '2-30 个字符' },
  { key: 'store_address', label: '门店地址', placeholder: '街道, 城市，至少 6 个字符' },
]

/**
 * 注册：买家只要四个基础字段；商家额外必填门店名称与地址，
 * 门店是卖家的发货店址，和买家账号下的收货地址是两份数据
 */
export default function Register() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    mobile: '',
    store_name: '',
    store_address: '',
  })
  const [accountType, setAccountType] = useState('buyer')
  const [coords, setCoords] = useState(null)
  const [locating, setLocating] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)
  const isMerchant = accountType === 'merchant'
  const visibleFields = isMerchant ? [...FIELDS, ...STORE_FIELDS] : FIELDS
  const strength = passwordStrength(form.password)

  const update = (key) => (e) => {
    const value = e.detail.value
    setForm((prev) => ({ ...prev, [key]: key === 'mobile' ? value.replace(/\D/g, '') : value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  const fillMyLocation = async () => {
    setLocating(true)
    setCoords(await locate())
    setLocating(false)
  }

  const submit = async () => {
    if (busy) return
    const nextErrors = {}
    const clean = {}
    visibleFields.forEach(({ key }) => {
      const result = validateField(key, form[key])
      if (result.error) nextErrors[key] = result.error
      else clean[key] = result.value
    })
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setBusy(true)
    setSubmitError('')
    try {
      await registerAccount({
        ...clean,
        account_type: accountType,
        longitude: coords?.longitude ?? 0,
        latitude: coords?.latitude ?? 0,
      })
      // 注册不发令牌（邮箱验证开关未知），回登录页并把邮箱填好，人只改密码就能进来。
      // 用 reLaunch 而不是 redirectTo：登录成功本来就会 reLaunch 到首页，留半条返回栈只会让人退回一个已经没意义的注册页
      Taro.reLaunch({ url: `/pages/login/index?account=${encodeURIComponent(clean.email)}` })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="headline">创建账号</View>

      <View className="pills">
        {ACCOUNT_TYPES.map((type) => (
          <Text
            key={type.key}
            className={`pill ${accountType === type.key ? 'pill--on' : ''}`}
            onClick={() => setAccountType(type.key)}
          >
            {type.label}
          </Text>
        ))}
      </View>

      <View className="hint">
        {isMerchant ? '商家需填门店名称与门店地址，注册后账号同时具备买家能力与运营中台入口' : '买家账号只用于浏览与下单'}
      </View>

      <View className="form">
        {visibleFields.map((field) => (
          <View className="field" key={field.key}>
            <View className="field__head">
              <Text className="field__label">{field.label}</Text>
              {field.key === 'password' && form.password ? (
                <Text className={`strength strength--${strength.tone}`}>强度 {strength.label}</Text>
              ) : null}
            </View>
            <Input
              className={`field__input ${errors[field.key] ? 'field__input--bad' : ''}`}
              type={field.digits ? 'number' : 'text'}
              password={Boolean(field.password)}
              maxlength={field.digits ? 11 : 40}
              placeholder={field.placeholder}
              value={field.digits ? formatMobile(form[field.key]) : form[field.key]}
              onInput={update(field.key)}
            />
            {errors[field.key] ? <Text className="field__error">{errors[field.key]}</Text> : null}
          </View>
        ))}
      </View>

      {isMerchant && (
        <View className="geo">
          <Text className="geo__link" onClick={locating ? undefined : fillMyLocation}>
            {locating ? '定位中…' : coords ? `已定位：${coords.longitude}, ${coords.latitude}` : '用我的当前位置作为门店坐标'}
          </Text>
          {coords ? <Text className="geo__hint">门店坐标用于买家按距离排序，可稍后在门店资料里改</Text> : null}
        </View>
      )}

      {submitError ? <View className="tip">{submitError}</View> : null}

      <Button className="primary" loading={busy} onClick={submit}>
        注册
      </Button>

      <View className="foot">
        <Text className="foot__ask">已有账号？</Text>
        <Text className="foot__link" onClick={() => Taro.navigateBack()}>
          去登录
        </Text>
      </View>
    </View>
  )
}
