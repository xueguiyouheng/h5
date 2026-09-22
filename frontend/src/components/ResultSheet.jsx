import { useEffect, useState } from 'react'
import iconSuccess from '../assets/checkout/icon-success.svg'
import iconFailed from '../assets/checkout/icon-failed.svg'

const TONES = {
  success: { icon: iconSuccess, alt: 'success' },
  failed: { icon: iconFailed, alt: 'failed' },
}

const EXIT_MS = 320

/**
 * 下单结果面板（SKh1XGuRfL / q721g3bZFw）：两种结果同一套几何，只是图标与文案不同。
 * 位移走内联 transform，Tailwind 的 translate-y-* 在同类规则下会被顶掉。
 */
function ResultSheet({ tone, title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary, onClose }) {
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const { icon, alt } = TONES[tone] ?? TONES.success

  // 先画一帧藏在屏幕外，再开始位移，否则浏览器可能直接跳到终点没有动画
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function dismiss() {
    if (!onClose || closing) return
    setClosing(true)
    setShown(false)
    setTimeout(onClose, EXIT_MS)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-[rgba(29,35,53,0.51)] transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        className={`absolute bottom-0 w-full max-w-[480px] bg-white rounded-t-[35px] px-[30px] pt-[49px] pb-[41px] transition-transform motion-reduce:transition-none ${
          closing
            ? 'duration-[320ms] ease-[cubic-bezier(0.66,0,1,1)]'
            : 'duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
        }`}
        style={{ transform: shown ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="flex h-[95px] items-center justify-center">
          <img className="max-h-full max-w-[95px] object-contain" src={icon} alt={alt} />
        </div>
        <h2 className="mx-auto mt-[28px] w-[212px] text-center text-[26px] font-medium leading-[35px] text-[#181d2d]">
          {title}
        </h2>
        <p className="mx-auto mt-[20px] w-[267px] text-center text-base font-medium leading-6 text-[#b6bbb9]">
          {description}
        </p>
        <button
          className="mt-[32px] w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold tracking-[-0.24px] leading-5 text-white cursor-pointer hover:brightness-110 active:brightness-90"
          type="button"
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && (
          <button
            className="mx-auto mt-[24px] block w-fit border-none bg-none p-0 cursor-pointer font-[inherit] text-base font-bold tracking-[-0.24px] leading-5 text-black"
            type="button"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export default ResultSheet
