import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import UnderlineField from '../components/UnderlineField'
import { useAuthStore } from '../stores/authStore'
import iconMail from '../assets/auth/icon-mail.svg'
import iconLock from '../assets/auth/icon-lock.svg'
import iconEye from '../assets/auth/icon-eye.svg'

function Login() {
  const registered = useLocation().state?.registered
  // 注册跳转过来时预填刚建的账号；演示账号只在没有注册上下文时才填，否则横幅与输入框会对不上
  const [email, setEmail] = useState(registered ?? 'admin')
  const [password, setPassword] = useState(registered ? '' : 'admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [activeField, setActiveField] = useState('email')
  const [forgotOpen, setForgotOpen] = useState(false)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const clearError = useAuthStore((s) => s.clearError)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      navigate('/shop', { replace: true })
    } catch {}
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-x-clip bg-white">
      <PageHeader />

      <h1 className="m-0 mt-[43px] pl-[43px] text-[20px] font-medium leading-[35px] text-black">Log in</h1>

      <form className="mt-[32px] px-[30px]" onSubmit={handleSubmit}>
        <div className="space-y-[35px] pl-[10px] pr-[12px]">
          {registered && (
            <p className="m-0 text-[10px] leading-[14px] text-[#00b861]">
              账号已创建，请用 {registered} 登录
            </p>
          )}

          <UnderlineField
            name="email"
            label="Email address"
            icon={iconMail}
            iconClass="h-[18px] w-[18px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocusField={() => setActiveField('email')}
            active={activeField === 'email'}
            autoComplete="username"
          />

          <UnderlineField
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            icon={iconLock}
            iconClass="h-[18px] w-[16px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocusField={() => setActiveField('password')}
            active={activeField === 'password'}
            autoComplete="current-password"
            right={
              <button
                className="absolute right-[6px] top-[5px] flex h-[15px] w-[18px] items-center justify-center border-none bg-none p-0 cursor-pointer"
                type="button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((v) => !v)}
              >
                <img className="h-[14.5px] w-[18px]" src={iconEye} alt="" />
              </button>
            }
          />
        </div>

        {error && (
          <p className="m-0 mt-[10px] px-[10px] text-center text-[10px] leading-[14px] text-[#f50000]">{error}</p>
        )}

        <button
          className="mt-[32px] h-[47px] w-full rounded-full bg-[#00b861] text-sm font-semibold leading-[23px] text-white cursor-pointer disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Log in…' : 'Log in'}
        </button>

        {/* 找回密码是次要出口，放在主按钮下方，不占表单主位 */}
        <button
          className="mt-[18px] block w-full border-none bg-none p-0 text-center text-sm font-medium leading-[18px] tracking-[-0.2px] text-[#f50000] underline cursor-pointer"
          type="button"
          aria-expanded={forgotOpen}
          onClick={() => setForgotOpen((v) => !v)}
        >
          Forgot Password?
        </button>

        {forgotOpen && (
          <p className="m-0 mx-auto mt-[8px] w-[295px] text-center text-[10px] leading-[14px] text-[#b6bbb9]">
            演示后端未开放重置接口，请用测试账号 admin / admin123 登录，或到注册页重新创建资料。
          </p>
        )}
      </form>

      <div className="mt-auto px-[30px] pb-[34px] pt-[26px] text-center">
        <p className="m-0 text-[10px] leading-[14px] text-[#b6bbb9]">
          测试账号 admin / admin123 ·
          <button
            className="border-none bg-none p-0 pl-[4px] text-[10px] leading-[14px] text-[#00b861] cursor-pointer"
            type="button"
            onClick={() => navigate('/onboarding')}
          >
            查看新手引导
          </button>
        </p>
        <p className="m-0 mt-[14px] text-sm leading-[18px] tracking-[-0.2px] text-black">
          Don’t have an account?
          <button
            className="border-none bg-none p-0 pl-[8px] text-sm font-medium leading-[18px] tracking-[-0.2px] text-[#00b861] cursor-pointer"
            type="button"
            onClick={() => navigate('/register')}
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}

export default Login
