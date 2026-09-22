import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import UnderlineField from '../components/UnderlineField'
import { registerAccount } from '../api'
import { locate } from '../utils/locate'
import { useLegalCopy } from '../stores/settingsStore'
import {
  formatMobile,
  passwordStrength,
  validateProfileField,
} from '../stores/profileStore'
import iconUser from '../assets/auth/icon-user.svg'
import iconMail from '../assets/auth/icon-mail.svg'
import iconLock from '../assets/auth/icon-lock.svg'
import iconMobile from '../assets/auth/icon-mobile.svg'
import iconAddress from '../assets/profile/icon-address.svg'

const FIELDS = [
  {
    key: 'username',
    label: 'Username',
    icon: iconUser,
    iconClass: 'h-[18px] w-[18px]',
    autoComplete: 'username',
  },
  {
    key: 'email',
    label: 'Email address',
    icon: iconMail,
    iconClass: 'h-[18px] w-[18px]',
    autoComplete: 'email',
  },
  {
    key: 'password',
    label: 'Password',
    icon: iconLock,
    iconClass: 'h-[18px] w-[16px]',
    autoComplete: 'new-password',
  },
  {
    key: 'mobile',
    label: 'Mobile number',
    icon: iconMobile,
    iconClass: 'h-[18px] w-[21px]',
    autoComplete: 'tel',
  },
]

const ACCOUNT_TYPES = [
  { key: 'buyer', label: '买家' },
  { key: 'merchant', label: '商家' },
]

// 门店地址是卖家发货的店址，和买家账号下的收货地址是两份数据
const STORE_FIELDS = [
  { key: 'store_name', label: '门店名称', icon: iconUser, iconClass: 'h-[18px] w-[18px]' },
  { key: 'store_address', label: '门店地址', icon: iconAddress, iconClass: 'h-[18px] w-[18px]' },
]

const STORE_RULES = {
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

function validateStoreField(key, raw) {
  const rule = STORE_RULES[key]
  if (!rule) return { value: raw }
  return rule(String(raw))
}

function Register() {
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
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [errors, setErrors] = useState({})
  const [activeField, setActiveField] = useState('username')
  const [legal, setLegal] = useState(null)
  const legalCopy = useLegalCopy()
  const navigate = useNavigate()
  const strength = passwordStrength(form.password)
  const isMerchant = accountType === 'merchant'
  const visibleFields = isMerchant ? [...FIELDS, ...STORE_FIELDS] : FIELDS

  const update = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const fillMyLocation = async () => {
    setLocating(true)
    setCoords(await locate())
    setLocating(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = {}
    const clean = {}
    visibleFields.forEach(({ key }) => {
      const result = key.startsWith('store_')
        ? validateStoreField(key, form[key])
        : validateProfileField(key, form[key])
      if (result.error) nextErrors[key] = result.error
      else clean[key] = result.value
    })
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await registerAccount({
        ...clean,
        account_type: accountType,
        longitude: coords?.longitude ?? 0,
        latitude: coords?.latitude ?? 0,
      })
      navigate('/login', { state: { registered: clean.email } })
    } catch (err) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] overflow-x-clip bg-white pb-[40px]">
      <PageHeader />

      <h1 className="m-0 mt-[43px] pl-[43px] text-[20px] font-medium leading-[35px] text-black">
        Create your account
      </h1>

      <div className="mt-[22px] flex gap-[10px] pl-[40px]" role="radiogroup" aria-label="账号类型">
        {ACCOUNT_TYPES.map((type) => (
          <button
            key={type.key}
            className={`h-[30px] rounded-full px-[16px] text-xs font-medium leading-[18px] cursor-pointer border ${
              accountType === type.key
                ? 'bg-[#00b861] border-[#00b861] text-white'
                : 'bg-white border-[#f4f5f7] text-[#8b8b8b]'
            }`}
            type="button"
            role="radio"
            aria-checked={accountType === type.key}
            onClick={() => setAccountType(type.key)}
          >
            {type.label}
          </button>
        ))}
      </div>

      <p className="m-0 mt-[8px] pl-[40px] text-[10px] leading-[14px] text-[#b6bbb9]">
        {isMerchant ? '商家需填门店名称与门店地址，注册后账号同时具备买家能力与运营中台入口' : '买家账号只用于浏览与下单'}
      </p>

      <form className="mt-[32px]" onSubmit={handleSubmit}>
        <div className="space-y-[37px] pl-[40px] pr-[42px]">
          {visibleFields.map(({ key, label, icon, iconClass, autoComplete }) => (
            <UnderlineField
              key={key}
              name={key}
              label={label}
              type={key === 'password' ? 'password' : 'text'}
              icon={icon}
              iconClass={iconClass}
              value={key === 'mobile' ? formatMobile(form[key]) : form[key]}
              onChange={update(key)}
              onFocusField={() => setActiveField(key)}
              active={activeField === key}
              error={errors[key]}
              autoComplete={autoComplete}
              right={
                key === 'password' && form.password ? (
                  <span
                    className={`absolute right-0 top-[2px] text-[10px] leading-[14px] ${strength.className}`}
                  >
                    强度 {strength.label}
                  </span>
                ) : null
              }
            />
          ))}
        </div>

        {isMerchant && (
          <div className="mt-[14px] pl-[56px]">
            <button
              className="border-none bg-none p-0 text-[10px] leading-[14px] text-[#00b861] cursor-pointer disabled:text-[#b6bbb9]"
              type="button"
              disabled={locating}
              onClick={fillMyLocation}
            >
              {locating ? '定位中…' : coords ? `已定位：${coords.longitude}, ${coords.latitude}` : '用我的当前位置作为门店坐标'}
            </button>
            {coords && (
              <span className="ml-[8px] text-[10px] leading-[14px] text-[#b6bbb9]">
                门店坐标用于买家按距离排序，可稍后在门店资料里改
              </span>
            )}
          </div>
        )}

        {submitError && (
          <p className="m-0 mt-[14px] pl-[40px] text-[10px] leading-[14px] text-[#f50000]">{submitError}</p>
        )}

        <button
          className="mx-[30px] mt-[44px] block h-[47px] w-[calc(100%-60px)] rounded-full bg-[#00b861] text-sm font-semibold leading-[23px] text-white cursor-pointer disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Next'}
        </button>
      </form>

      <p className="m-0 mx-auto mt-[36px] w-[238px] text-center text-xs leading-5 tracking-[-0.2px] text-[#b6bbb9]">
        By signing up you agree of our{' '}
        <LegalLink kind="terms" label="Terms of Use" active={legal === 'terms'} onClick={setLegal} />
        {' and '}
        <LegalLink kind="privacy" label="Privacy Policy" active={legal === 'privacy'} onClick={setLegal} />
      </p>

      {legal && (
        <div className="mx-auto mt-[12px] w-[295px] rounded-[12px] bg-[#f9f8f6] px-[14px] py-[12px]">
          <p className="m-0 text-[11px] leading-[16px] text-[#8b8b8b]">{legalCopy[legal]}</p>
          <button
            className="mt-[8px] border-none bg-none p-0 text-[10px] leading-[14px] text-[#00b861] cursor-pointer"
            type="button"
            onClick={() => setLegal(null)}
          >
            收起
          </button>
        </div>
      )}
    </div>
  )
}

function LegalLink({ kind, label, active, onClick }) {
  return (
    <button
      className={`border-none bg-none p-0 text-xs leading-5 tracking-[-0.2px] cursor-pointer ${
        active ? 'text-black underline' : 'text-[#00b861]'
      }`}
      type="button"
      onClick={() => onClick(active ? null : kind)}
    >
      {label}
    </button>
  )
}

export default Register
