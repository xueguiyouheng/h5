import { useState } from 'react'
import iconFilter from '../assets/category/icon-filter.svg'
import SearchIcon from '../components/SearchIcon'
import PageHeader from '../components/PageHeader'
import CartButton from '../components/CartButton'
import ProductTile from '../components/ProductTile'
import CategoryTile from '../components/CategoryTile'
import { SkeletonTiles } from '../components/Skeleton'
import QueryError from '../components/QueryError'
import { useInfiniteCategories, useInfiniteProducts } from '../hooks/useShopData'

function ClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="#222324" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function Search() {
  const [query, setQuery] = useState('')
  const keyword = query.trim()
  const searching = keyword.length > 0

  const { sentinelRef: categorySentinel, ...cats } = useInfiniteCategories(8)
  // 搜索只是商品列表接口的一个过滤字段；按销量倒序与原搜索行为一致
  const { sentinelRef: resultSentinel, ...results } = useInfiniteProducts({ q: keyword, sort: 'sales' }, 6, searching)

  const list = searching ? results : cats

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-8 overflow-x-clip">
      <PageHeader
        title="Explore"
        size="sm"
        right={
          searching && (
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
          )
        }
      />

      <div className="relative flex items-center gap-[15px] h-[39px] mt-2 mx-[30px] pl-4 pr-10 bg-[#f8f8f8] rounded-[15px]">
        <SearchIcon color="#C1C7D0" />
        <input
          className="flex-1 min-w-0 w-full border-none bg-none outline-none text-sm leading-5 text-black placeholder:text-[#7a869a]/50"
          type="text"
          placeholder="Search"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {searching && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 border-none bg-none p-0 cursor-pointer"
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {list.isError && (
        <QueryError error={list.error} onRetry={list.refetch} className="mt-6 mx-[30px]" />
      )}
      {list.isPending &&
        (searching ? (
          <SkeletonTiles count={4} wrapClass="grid grid-cols-2 gap-4 mt-[21px] px-[21px]" />
        ) : (
          <SkeletonTiles
            count={4}
            tileClass="aspect-[149/154] rounded-[18px]"
            wrapClass="grid grid-cols-2 gap-[17px] mt-[25px] px-[30px]"
          />
        ))}

      {!searching && cats.data && (
        <>
          <div className="grid grid-cols-2 gap-[17px] mt-[25px] px-[30px]">
            {cats.data.map((c) => (
              <CategoryTile key={c.id} category={c} />
            ))}
          </div>
          <div ref={categorySentinel} className="h-px" aria-hidden="true" />
          {cats.isFetchingNextPage && (
            <SkeletonTiles
              count={2}
              tileClass="aspect-[149/154] rounded-[18px]"
              wrapClass="grid grid-cols-2 gap-[17px] mt-4 px-[30px]"
            />
          )}
          {!cats.hasNextPage && <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>}
        </>
      )}

      {searching && results.data && (
        <>
          {results.data.length === 0 && !results.isFetching ? (
            <p className="mt-6 text-sm text-center text-[#b6bbb9]">没有找到相关商品</p>
          ) : (
            <>
              <div
                className={
                  'grid grid-cols-2 gap-4 mt-[21px] px-[21px] transition-opacity duration-200 ' +
                  (results.isPlaceholderData ? 'opacity-50' : 'opacity-100')
                }
              >
                {results.data.map((p) => (
                  <ProductTile key={p.id} product={p} />
                ))}
              </div>
              <div ref={resultSentinel} className="h-px" aria-hidden="true" />
              {results.isFetchingNextPage && (
                <SkeletonTiles count={2} wrapClass="grid grid-cols-2 gap-4 mt-4 px-[21px]" />
              )}
              {!results.hasNextPage && results.data.length > 0 && (
                <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Search
