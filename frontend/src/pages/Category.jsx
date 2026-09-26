import { useParams, useSearchParams } from 'react-router-dom'
import iconFilter from '../assets/category/icon-filter.svg'
import PageHeader from '../components/PageHeader'
import CartButton from '../components/CartButton'
import ProductTile from '../components/ProductTile'
import { Skeleton, SkeletonTiles } from '../components/Skeleton'
import QueryError from '../components/QueryError'
import { useCategory, useInfiniteProducts } from '../hooks/useShopData'

function Category() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const subcategory = params.get('sub') ?? ''
  // 类目信息与其下商品分开取：商品走所有列表页共用的那一个接口
  const meta = useCategory(id)
  const {
    data: products,
    sentinelRef,
    isPlaceholderData,
    error: listError,
    refetch: refetchList,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts({ categoryId: id, subcategory }, 6)

  const category = meta.data
  const subcategories = category?.subcategories ?? ['All']
  const activeTab = Math.max(0, subcategories.indexOf(subcategory))
  // 页头和 tab 只跟类目信息走，商品换批次不能把它们换成骨架屏
  const isPending = meta.isPending
  const queryError = meta.isError ? meta.error : listError
  const retry = () => {
    meta.refetch()
    refetchList()
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-8 overflow-x-clip">
      <PageHeader
        back="/shop"
        right={
          <>
            <button
              className="flex h-6 w-6 items-center justify-center border-none bg-none p-0 cursor-pointer"
              type="button"
              aria-label="Filter"
            >
              <img src={iconFilter} alt="" width="24" height="24" />
            </button>
            <CartButton className="h-6 w-6" />
          </>
        }
      >
        <h1 className="mt-3 px-[30px] text-xl font-medium leading-6 text-black">
          {category?.label ?? (isPending ? <Skeleton className="h-[24px] w-[120px] rounded" /> : '...')}
        </h1>
      </PageHeader>

      <div className="flex mt-2 px-[7px] overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isPending &&
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="shrink-0 my-[10px] mx-[14px] h-[24px] w-[52px] rounded" />
          ))}
        {!isPending &&
          subcategories.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setParams(label === 'All' ? {} : { sub: label })}
              className={
                'relative shrink-0 px-[14px] py-[10px] border-none bg-none cursor-pointer font-[inherit] text-sm leading-6 ' +
                (i === activeTab ? 'text-black' : 'text-[#b6bbb9]')
              }
            >
              {label}
              {i === activeTab && (
                <span className="absolute inset-x-[7px] bottom-[3px] h-px bg-black" aria-hidden="true" />
              )}
            </button>
          ))}
      </div>

      {/* 屏上还有商品就不报红，后台刷新失败留着旧数据 */}
      {queryError && !products && <QueryError error={queryError} onRetry={retry} className="mt-4 mx-[21px]" />}
      {!products && !queryError && (
        <div className="mt-5 px-[21px]">
          <SkeletonTiles />
        </div>
      )}

      {products && (
        <>
          {/* 换子类目时先显示上一批并压暗，新数据到了再换回来，避免整片闪白 */}
          <div
            className={
              'grid grid-cols-2 gap-4 mt-5 px-[21px] transition-opacity duration-200 ' +
              (isPlaceholderData ? 'opacity-50' : 'opacity-100')
            }
          >
            {products.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="mt-4 px-[21px]">
              <SkeletonTiles count={2} />
            </div>
          )}
          {!hasNextPage && !isPlaceholderData && !isFetchingNextPage && (
            <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>
          )}
        </>
      )}
    </div>
  )
}

export default Category
