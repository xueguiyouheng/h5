import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import heroBasket from '../assets/onboarding/hero-basket.png'
import { fetchOnboarding } from '../api'

// 文案来自 /api/onboarding/slides，{占位} 由接口统计替换；这份兜底保证首屏不空白
const FALLBACK_SLIDES = [
  {
    title: 'Welcome to Grocery Shopping',
    description: 'Your items has been placed and is on it’s way to being processed',
  },
  {
    title: 'Fresh picks every day',
    description: '{category_count} 个生鲜分类、{product_count} 款在售商品，首页两列列表向下滑动即可加载更多。',
  },
  {
    title: 'Save on every basket',
    description: '券包里现有 {voucher_count} 张券，${lowest_spend} 起就能抵扣，满 ${free_delivery_threshold} 免运费。',
  },
]

function fillStats(text, stats) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (match, key) =>
    stats[key] === undefined || stats[key] === null ? match : String(stats[key])
  )
}

function OnBoarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const { data } = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, staleTime: 3600000 })
  const source = data?.list?.length ? data.list : FALLBACK_SLIDES
  const slides = source.map((item) => ({ ...item, description: fillStats(item.description, data?.stats ?? {}) }))
  const slide = slides[step] ?? slides[0]

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-x-clip bg-white">
      <div className="absolute right-[41px] top-[87px] flex items-center gap-[8px]">
        {slides.map((item, index) =>
          index === step ? (
            <span key={item.title} className="h-[8px] w-[26px] rounded-full bg-[#00b861]" />
          ) : (
            <button
              key={item.title}
              className="h-[8px] w-[8px] rounded-full border-none bg-[#08c25e]/40 p-0 cursor-pointer"
              type="button"
              aria-label={`查看第 ${index + 1} 页引导`}
              onClick={() => setStep(index)}
            />
          )
        )}
      </div>

      <div className="relative mt-[151px] flex justify-center">
        <span
          className="absolute left-1/2 top-[34px] h-[204px] w-[204px] -translate-x-1/2 rounded-full bg-[#08c25e]/40"
          aria-hidden="true"
        />
        <img className="relative h-[272px] w-[272px]" src={heroBasket} alt="生鲜购物篮" />
      </div>

      <h1 className="mx-auto mt-[8px] h-[82px] w-[230px] text-center text-[26px] font-medium leading-[27px] text-[#181d2d]">
        {slide.title}
      </h1>

      <p className="mx-auto mt-[8px] w-[267px] text-center text-base font-medium leading-6 text-[#b6bbb9]">
        {slide.description}
      </p>

      <div className="mt-[81px] flex items-center gap-[47px] pl-[40px]">
        <button
          className="flex h-[51px] w-[153px] items-center justify-center rounded-full border-none bg-[#00b861] text-base font-bold leading-5 tracking-[-0.24px] text-white cursor-pointer hover:brightness-110 active:brightness-90"
          type="button"
          onClick={() => navigate('/login')}
        >
          Login
        </button>
        <button
          className="border-none bg-none p-0 text-base font-bold leading-5 tracking-[-0.24px] text-[#00b861] cursor-pointer"
          type="button"
          onClick={() => navigate('/register')}
        >
          Sign up
        </button>
      </div>
    </div>
  )
}

export default OnBoarding
