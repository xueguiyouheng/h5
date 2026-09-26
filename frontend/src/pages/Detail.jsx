import { useLayoutEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import iconPlus from '../assets/shop/icon-plus.svg'
import BackIcon from '../components/BackIcon'
import QueryError from '../components/QueryError'
import CartButton from '../components/CartButton'
import SoldOutBadge from '../components/SoldOutBadge'
import { useProductDetail, useFavoriteToggle } from '../hooks/useShopData'
import { useGoBack } from '../hooks/useGoBack'
import { useAddToCart } from '../hooks/useAddToCart'

function HeartIcon({ size = 24, color = '#000', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5 C12 20.5 3.5 15 3.5 9.2 C3.5 6.3 5.8 4.5 8.1 4.5 C9.8 4.5 11.2 5.5 12 7 C12.8 5.5 14.2 4.5 15.9 4.5 C18.2 4.5 20.5 6.3 20.5 9.2 C20.5 15 12 20.5 12 20.5 Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[347px] bg-[#f9f8f6]">
        <div className="mx-auto mt-[78px] h-[213px] w-[213px] rounded-full bg-[#ededed]" />
      </div>
      <div className="px-[30px]">
        <div className="mt-6 h-7 w-[98px] rounded bg-[#ededed]" />
        <div className="mt-2 h-4 w-[42px] rounded bg-[#ededed]" />
        <div className="mt-7 flex items-center justify-between">
          <div className="h-9 w-[91px] rounded-full bg-[#ededed]" />
          <div className="h-7 w-[63px] rounded bg-[#ededed]" />
        </div>
        <div className="mt-9 h-5 w-[155px] rounded bg-[#ededed]" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-[#ededed]" />
          <div className="h-4 w-4/5 rounded bg-[#ededed]" />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="aspect-[159/199] rounded-[18px] bg-[#ededed]" />
          <div className="aspect-[159/199] rounded-[18px] bg-[#ededed]" />
        </div>
      </div>
    </div>
  )
}

function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [qty, setQty] = useState(1)
  const { data: product, isPending, isError, error, refetch } = useProductDetail(id)
  const addToCart = useAddToCart()
  const favorite = useFavoriteToggle()

  // 无货时加购必然被服务端按「现有数量 + 本次 > 库存」拒掉，按钮不给点
  const soldOut = (product?.stock ?? 0) <= 0

  // 从收藏或分享链接进来可能落在别家门店的商品上，加购会自动切店，切了要说清楚为什么门店变了
  // 记下当时的商品 id：详情页换商品不重挂载，别处的提示不能跟着带过来
  const [switched, setSwitched] = useState(null)

  const add = async (item, count, source) => {
    try {
      const result = await addToCart(item, count, source)
      setSwitched(result?.switched ? { productId: id, name: result.switched.storeName } : null)
    } catch {
      // 失败原因（库存/下架）不在这里重复报，与改动前的表现一致
    }
  }

  const toggleFavorite = () => {
    if (!product || favorite.isPending) return
    favorite.mutate(product.id)
  }

  // 列表页的滚动位置会带进详情页，切换商品时也回到顶部
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[119px] overflow-x-clip">
      {isError && !product && <QueryError error={error} onRetry={refetch} className="mt-6 mx-[30px]" />}
      {isPending && <DetailSkeleton />}

      {product && (
        <>
          {/* 吸顶栏：图标区域用实心白遮住，滚动时主图不会穿到返回/收藏底下 */}
          <div className="sticky top-0 z-20 h-0">
            <div className="absolute inset-x-0 top-0 h-[96px] bg-[linear-gradient(180deg,#fff_0,#fff_80%,rgba(255,255,255,0)_100%)]" aria-hidden="true" />
            <button
              className="absolute left-[21px] top-[54px] flex items-center justify-center w-6 h-6 border-none bg-none p-0 cursor-pointer"
              type="button"
              aria-label="Back"
              onClick={goBack}
            >
              <BackIcon />
            </button>
            <button
              className="absolute right-[62px] top-[54px] flex items-center justify-center w-6 h-6 border-none bg-none p-0 cursor-pointer"
              type="button"
              aria-label={product.collected ? '取消收藏' : '收藏'}
              aria-pressed={product.collected}
              onClick={toggleFavorite}
            >
              <HeartIcon filled={product.collected} color={product.collected ? '#00b861' : '#000'} />
            </button>
            <CartButton className="absolute right-[29px] top-[54px] w-6 h-6" />
          </div>

          <section className="relative h-[347px] bg-[#f9f8f6]">
            <img
              className="absolute left-1/2 top-[78px] -translate-x-1/2 w-[213px] h-[213px] object-contain pointer-events-none"
              src={product.heroImage}
              alt={product.name}
            />
          </section>

          <main className="px-[30px]">
            <h1 className="mt-[14px] text-[26px] font-medium leading-6 text-black">{product.name}</h1>
            <p className="mt-7 text-sm font-medium leading-[18px] text-[#b6bbb9]">{product.unit}</p>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-[22px] h-9 w-[91px] justify-center rounded-full border border-[#e4e4e4] bg-white">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={qty <= 1}
                  onClick={() => qty > 1 && setQty(qty - 1)}
                  className="w-2 h-4 border-none bg-none p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M0 4 H8" stroke="#000" strokeWidth="1.2" />
                  </svg>
                </button>
                <span className="text-lg font-medium leading-6 text-black">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty(qty + 1)}
                  className="w-2 h-4 border-none bg-none p-0 cursor-pointer"
                >
                  <svg width="9" height="8" viewBox="0 0 9 8" aria-hidden="true">
                    <path d="M0 4 H8 M4.5 0 V8" stroke="#000" strokeWidth="1.2" />
                  </svg>
                </button>
              </div>
              <div className="text-2xl font-medium leading-6 text-black">{product.price}</div>
            </div>

            {switched?.productId === id && (
              <p className="m-0 mt-[18px] text-sm leading-5 text-[#00b861]" role="status">
                {`已切换到「${switched.name}」，购物车与下单都按这家门店`}
              </p>
            )}

            <h2 className="mt-[34px] text-base font-medium leading-5 text-black">About the product</h2>
            <p className="mt-[15px] text-sm leading-[24px] text-[#b6bbb9]">{product.description}</p>

            {product.related?.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-[16px]">
                {product.related.map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-[159/199] bg-[#f9f8f6] rounded-[18px] overflow-hidden cursor-pointer"
                    onClick={() => navigate(`/product/${p.id}`)}
                  >
                    <div className="absolute top-[12px] inset-x-[20px] bottom-[64px] flex items-center justify-center overflow-hidden">
                      <img
                        className="max-h-full max-w-full object-contain pointer-events-none"
                        src={p.image}
                        alt={p.name}
                      />
                    </div>
                    <div className="absolute left-[17px] right-[17px] bottom-[18px] flex items-end justify-between">
                      <div>
                        <div className="text-sm leading-5 text-black">{p.name}</div>
                        <div className="text-[15px] font-medium leading-5 text-black">{p.price}</div>
                      </div>
                      {(p.stock ?? 0) <= 0 ? (
                        <SoldOutBadge className="shrink-0 w-[46px] h-[39px] rounded-[20px] bg-[#ff7465]/10 text-[10px] font-medium" />
                      ) : (
                        <button
                          className="shrink-0 flex items-center justify-center w-[39px] h-[39px] rounded-[20px] bg-[#00b861] border-none cursor-pointer hover:brightness-110"
                          type="button"
                          aria-label={`Add ${p.name} to cart`}
                          onClick={(e) => {
                            e.stopPropagation()
                            add({ id: p.id, name: p.name, price: `${p.price} / kg`, image: p.image, storeId: p.storeId }, 1, e.currentTarget)
                          }}
                        >
                          <img src={iconPlus} alt="" width="15" height="15" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/70 backdrop-blur-[14px] shadow-[0_-10px_25px_rgba(0,0,0,0.07)] flex items-center gap-[15px] px-[34px] pt-[24px] pb-[20px]">
            <button
              className="flex items-center justify-center w-[51px] h-[51px] rounded-full border border-[#e4e4e4] bg-white cursor-pointer"
              type="button"
              aria-label={product.collected ? '取消收藏' : '收藏'}
              aria-pressed={product.collected}
              onClick={toggleFavorite}
            >
              <HeartIcon size={21} filled={product.collected} color={product.collected ? '#00b861' : '#000'} />
            </button>
            <span className="shrink-0 flex items-center justify-center w-[51px] h-[51px] rounded-full border border-[#e4e4e4] bg-white">
              <CartButton className="w-full h-full" />
            </span>
            <button
              className={`flex-1 h-[51px] rounded-full border-none text-base font-bold text-white ${
                soldOut ? 'bg-[#c9cfc9] cursor-not-allowed' : 'bg-[#00b861] cursor-pointer hover:brightness-110 active:brightness-90'
              }`}
              type="button"
              disabled={soldOut}
              onClick={(e) => add({ id: product.id, name: product.name, price: `${product.price} / kg`, image: product.image, storeId: product.storeId }, qty, e.currentTarget)}
            >
              {soldOut ? '已售罄' : 'Add to Cart'}
            </button>
          </div>
        </>
      )}

      {!isPending && !isError && !product && (
        <div className="flex flex-col items-center pt-[200px]">
          <p className="text-sm text-[#b6bbb9]">商品不存在或已下架</p>
          <button
            className="mt-4 px-6 h-9 rounded-full bg-[#00b861] border-none text-sm text-white cursor-pointer"
            type="button"
            onClick={goBack}
          >
            返回
          </button>
        </div>
      )}
    </div>
  )
}

export default Detail
