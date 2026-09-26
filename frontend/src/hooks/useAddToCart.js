import { useCallback } from 'react'
import { useCartStore } from '../stores/cartStore'
import { useEnsureStore } from './useEnsureStore'

const DOT_SIZE = 18
const DURATION = 620

// 页面上可能同时存在页头与底部栏两个购物车入口，取当前视口内可见的那个
function pickCartTarget() {
  const targets = [...document.querySelectorAll('[data-cart-target]')]
  const inViewport = (el) => {
    const { top, bottom, left, right } = el.getBoundingClientRect()
    return top >= 0 && bottom <= window.innerHeight && left >= 0 && right <= window.innerWidth
  }
  return targets.find(inViewport) ?? targets[0]
}

// 落点由 [data-cart-target] 标记（CartButton）
function flyToCart(source) {
  const target = pickCartTarget()
  if (!source || !target || typeof source.animate !== 'function') return

  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const startX = from.left + from.width / 2
  const startY = from.top + from.height / 2

  const dot = document.createElement('span')
  dot.setAttribute('aria-hidden', 'true')
  dot.style.cssText =
    `position:fixed;left:${startX - DOT_SIZE / 2}px;top:${startY - DOT_SIZE / 2}px;` +
    `width:${DOT_SIZE}px;height:${DOT_SIZE}px;border-radius:9999px;background:#00b861;` +
    'opacity:.9;z-index:60;pointer-events:none'
  document.body.appendChild(dot)

  const dx = to.left + to.width / 2 - startX
  const dy = to.top + to.height / 2 - startY
  const anim = dot.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 0.9 },
      { transform: `translate(${dx * 0.5}px, ${dy - 70}px) scale(0.85)`, opacity: 0.85, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.15 },
    ],
    { duration: DURATION, easing: 'cubic-bezier(.4, 0, .2, 1)' }
  )
  anim.onfinish = () => dot.remove()
  // 后台标签页里动画时间轴不推进，onfinish 不会触发，兜底移除避免绿点残留
  setTimeout(() => dot.remove(), DURATION + 200)
}

// useAddToCart 统一加购入口：先出飞点动效，门店不对就先切过去，再走接口
export function useAddToCart() {
  const addItem = useCartStore((s) => s.addItem)
  const ensureStore = useEnsureStore()

  return useCallback(
    async (product, qty = 1, source) => {
      flyToCart(source ?? document.activeElement)
      const switched = await ensureStore(product.storeId)
      const data = await addItem(product, qty)
      return { data, switched }
    },
    [addItem, ensureStore]
  )
}
