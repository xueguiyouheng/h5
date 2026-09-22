import { useNavigate } from 'react-router-dom'
import iconPlus from '../assets/shop/icon-plus.svg'
import { useAddToCart } from '../hooks/useAddToCart'

function ProductTile({ product }) {
  const navigate = useNavigate()
  const addToCart = useAddToCart()
  return (
    <div
      className="relative aspect-[159/199] bg-[#f9f8f6] rounded-[18px] overflow-hidden cursor-pointer"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      {/* 图片锁在文字上方的格子里，方图/竖图都不会压到商品名 */}
      <div className="absolute top-[12px] inset-x-[20px] bottom-[64px] flex items-center justify-center overflow-hidden">
        <img
          className="max-h-full max-w-full object-contain pointer-events-none"
          src={product.image}
          alt={product.name}
        />
      </div>
      <div className="absolute left-[17px] right-[17px] bottom-[18px] flex items-end justify-between">
        <div>
          <div className="text-sm leading-5 text-black">{product.name}</div>
          <div className="text-[15px] font-medium leading-5 text-black">{product.price}</div>
        </div>
        <button
          className="shrink-0 flex items-center justify-center w-[39px] h-[39px] rounded-[20px] bg-[#00b861] border-none cursor-pointer hover:brightness-110"
          type="button"
          aria-label={`Add ${product.name} to cart`}
          onClick={(e) => {
            e.stopPropagation()
            addToCart(product, 1, e.currentTarget)
          }}
        >
          <img src={iconPlus} alt="" width="15" height="15" />
        </button>
      </div>
    </div>
  )
}

export default ProductTile
