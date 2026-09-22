import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import iconPlus from '../assets/shop/icon-plus.svg'
import bannerFood from '../assets/shop/banner-food.png'
import SearchIcon from '../components/SearchIcon'
import StoreSwitcher from '../components/StoreSwitcher'
import ProductTile from '../components/ProductTile'
import CategoryChip from '../components/CategoryChip'
import { Skeleton, SkeletonTiles, SkeletonScrollCards } from '../components/Skeleton'
import QueryError from '../components/QueryError'
import {
  useProducts,
  useInfiniteProducts,
  useHomeCarousel,
  useTopCategories,
} from '../hooks/useShopData'
import { useAddToCart } from '../hooks/useAddToCart'

// 横向滚动条按设计稿隐藏
const HIDE_BAR = '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

// 中台没配轮播时保留设计稿原图，首页不留白
const FALLBACK_SLIDE = {
  id: 'fallback',
  title: 'Enjoy the special offer up to 30%',
  subtitle: '25 - 30 April 2021',
  image: bannerFood,
  link: '',
}

function ProductCard({ product }) {
  const navigate = useNavigate()
  const addToCart = useAddToCart()
  return (
    <div
      className="relative shrink-0 basis-[137px] h-[172px] bg-[#f9f8f6] rounded-[15px] cursor-pointer"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <img
        className="absolute top-[15px] left-0 right-0 mx-auto w-[137px] h-[100px] object-contain pointer-events-none"
        src={product.image}
        alt={product.name}
      />
      <div className="absolute left-[17px] top-[119px]">
        <div className="text-xs leading-5 text-black">{product.name}</div>
        {product.price && <div className="mt-px text-[13px] font-medium leading-5 text-black">{product.price}</div>}
      </div>
      <button
        className="absolute left-[90px] top-[123px] flex items-center justify-center w-[34px] h-[34px] rounded-[17px] bg-[#00b861] border-none cursor-pointer hover:brightness-110"
        type="button"
        aria-label={`Add ${product.name} to cart`}
        onClick={(e) => {
          e.stopPropagation()
          addToCart(product, 1, e.currentTarget)
        }}
      >
        <img src={iconPlus} alt="" width="13" height="13" />
      </button>
    </div>
  )
}

function BannerCarousel() {
  const navigate = useNavigate()
  const { data, isPending } = useHomeCarousel()
  const slides = data?.length ? data : [FALLBACK_SLIDE]
  const [index, setIndex] = useState(0)
  const touchStartX = useRef(0)
  const active = Math.min(index, slides.length - 1)

  // 每次切换后重新计时，手动滑动不会被定时器抢拍
  useEffect(() => {
    if (slides.length < 2) return undefined
    const timer = setTimeout(() => setIndex((i) => (i + 1) % slides.length), 5000)
    return () => clearTimeout(timer)
  }, [index, slides.length])

  function swipe(endX) {
    const delta = endX - touchStartX.current
    if (Math.abs(delta) < 40 || slides.length < 2) return
    const next = delta < 0 ? active + 1 : active - 1
    setIndex((next + slides.length) % slides.length)
  }

  if (isPending) return <Skeleton className="h-[113px] mt-[17px] mx-[30px] rounded-[15px]" />

  return (
    <section
      className="relative h-[113px] mt-[17px] mx-[30px] overflow-hidden rounded-[15px] bg-[#f9f8f6]"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => swipe(e.changedTouches[0].clientX)}
    >
      {/* 整条轨道按页宽位移，切页是滑过去而不是淡入 */}
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div key={slide.id} className="relative h-full w-full shrink-0" aria-hidden={i !== active}>
            <div className="pt-5 pl-[27px]">
              <p className="m-0 w-[118px] text-sm font-medium leading-6 text-black line-clamp-2">
                {slide.title}
              </p>
              {slide.subtitle && (
                <p className="mt-[2px] mb-0 text-[10px] font-medium leading-6 text-[#a9aaa9]">{slide.subtitle}</p>
              )}
            </div>
            {/* 设计稿这张图是 FILL 铺满，中台上传的任意比例图同样按 cover 铺右侧再被卡片圆角裁掉 */}
            <img
              className="absolute right-0 top-0 h-full w-[157px] object-cover pointer-events-none"
              src={slide.image}
              alt=""
            />
            {slide.link?.startsWith('/') && (
              <button
                className="absolute inset-0 border-none bg-none p-0 cursor-pointer"
                type="button"
                aria-label={slide.title}
                onClick={() => navigate(slide.link)}
              />
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="absolute left-[27px] bottom-[12px] flex gap-[5px]">
          {slides.map((slide, i) => (
            <span
              key={slide.id}
              className={`h-[5px] w-[5px] rounded-full ${i === active ? 'bg-[#00b861]' : 'bg-[#c9cfc9]'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CategoryStrip() {
  const { data: categories, isPending, isError, error, refetch } = useTopCategories(12)

  if (isPending) {
    return (
      <div className="flex pt-[30px] px-[30px]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="shrink-0 w-[63px] flex flex-col items-center">
            <Skeleton className="h-[43px] w-[43px] rounded-full" />
            <Skeleton className="mt-[5px] h-[10px] w-[38px] rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) return <QueryError error={error} onRetry={refetch} className="mx-[30px] mt-[30px]" />
  if (!categories?.length) return null

  // 一格 63px，5 格正好占满 315 内容宽；类目多于 5 个时整条左右滑
  return (
    <div className={`flex overflow-x-auto ${HIDE_BAR} pt-[30px] px-[30px]`}>
      {categories.map((category, i) => (
        <CategoryChip key={category.id} category={category} index={i} />
      ))}
    </div>
  )
}

function ProductSection({ title, section }) {
  const { data: products, isPending, isError, error, refetch } = useProducts({ section })

  return (
    <section className="mt-[19px]">
      <div className="flex items-baseline justify-between px-[30px]">
        <h2 className="m-0 text-base font-medium text-black">{title}</h2>
        <button className="border-none bg-none p-0 cursor-pointer font-[inherit] text-sm text-[#b6bbb9]" type="button">
          See all
        </button>
      </div>
      {isError && <QueryError error={error} onRetry={refetch} className="mx-[30px] mt-3" />}
      {isPending && (
        <div className="mt-[19px] px-[30px]">
          <SkeletonScrollCards />
        </div>
      )}
      {products && (
        <div className={`flex gap-4 mt-[19px] px-[30px] pb-1 overflow-x-auto ${HIDE_BAR}`}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  )
}

function RecommendSection() {
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useInfiniteProducts({ section: 'recommend' }, 8)
  const list = data ?? []

  return (
    <section className="mt-[26px]">
      <h2 className="m-0 px-[30px] text-base font-medium text-black">为你推荐</h2>
      {isError && <QueryError error={error} onRetry={refetch} className="mx-[30px] mt-3" />}
      {isPending && (
        <div className="mt-[19px] px-[30px]">
          <SkeletonTiles />
        </div>
      )}
      {list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 mt-[19px] px-[30px]">
            {list.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="mt-4 px-[30px]">
              <SkeletonTiles count={2} />
            </div>
          )}
          {!hasNextPage && <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>}
        </>
      )}
    </section>
  )
}

function Shop() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[88px] overflow-x-clip">
      <header className="sticky top-0 z-10 flex items-center justify-center bg-white px-6 pt-5">
        <StoreSwitcher />
      </header>

      <div
        className="flex items-center gap-3 h-[39px] mt-[17px] mx-[30px] px-4 bg-[#f9f8f6] rounded-xl cursor-pointer"
        onClick={() => navigate('/search')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate('/search')
        }}
      >
        <SearchIcon />
        <input className="flex-1 min-w-0 border-none bg-none outline-none text-sm text-black" type="text" placeholder="Search" aria-label="Search" readOnly tabIndex={-1} />
      </div>

      <BannerCarousel />

      <CategoryStrip />

      <ProductSection title="Exclusive Offer" section="exclusive_offer" />
      <ProductSection title="Best Selling" section="best_selling" />
      <RecommendSection />
    </div>
  )
}

export default Shop
