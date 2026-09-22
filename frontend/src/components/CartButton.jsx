import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import iconBuy from '../assets/shop/icon-buy.svg'
import { useCartStore } from '../stores/cartStore'

function CartButton({ className = '' }) {
  const navigate = useNavigate()
  const count = useCartStore((s) => s.items.length)
  const badgeRef = useRef(null)

  // 角标数字变化时弹一下，作为「已加入购物车」的反馈
  useEffect(() => {
    if (count === 0) return
    badgeRef.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.45)' },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease-out' }
    )
  }, [count])

  return (
    <button
      className={`relative flex items-center justify-center border-none bg-none p-0 cursor-pointer ${className}`}
      type="button"
      aria-label="Cart"
      data-cart-target=""
      onClick={() => navigate('/cart')}
    >
      <img src={iconBuy} alt="" width="24" height="24" />
      {count > 0 && (
        <span
          ref={badgeRef}
          className="absolute -top-[6px] -right-[6px] min-w-[16px] h-4 px-1 rounded-full bg-[#00b861] text-[10px] leading-4 text-center text-white font-medium"
        >
          {count}
        </span>
      )}
    </button>
  )
}

export default CartButton
