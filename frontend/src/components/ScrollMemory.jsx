import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const offsets = new Map()
// 换页后浏览器会把 scrollY 夹到新页高度并派发 scroll，这段时间内的滚动不算用户滚动
const SWAP_GUARD_MS = 120

/**
 * 按路径记住滚动位置：tab 切回来仍在原处，切到短页也不会停在上一页的深度上闪一下。
 * 还原放在 layout effect，画之前就跳到位。
 */
export default function ScrollMemory() {
  const pathname = useLocation().pathname
  const activeRef = useRef(pathname)
  const swapRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      if (performance.now() - swapRef.current < SWAP_GUARD_MS) return
      offsets.set(activeRef.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    activeRef.current = pathname
    swapRef.current = performance.now()
    window.scrollTo(0, offsets.get(pathname) ?? 0)
  }, [pathname])

  return null
}
