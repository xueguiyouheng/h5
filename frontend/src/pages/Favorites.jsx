import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import CheckBox from '../components/CheckBox'
import SearchIcon from '../components/SearchIcon'
import { Skeleton } from '../components/Skeleton'
import QueryError from '../components/QueryError'
import { useInfiniteProducts, useRemoveFavorites } from '../hooks/useShopData'
import { useCartStore, parsePrice } from '../stores/cartStore'

function ClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="#222324" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// 售罄的行不给勾选：一键加购是整批生效整批不生效，混进去会把能买的也一起挡掉
function SoldOutTag() {
  return (
    <span className="shrink-0 rounded-full bg-[#ff7465]/10 px-[6px] text-[8px] leading-[14px] text-[#ff7465]">
      库存不足
    </span>
  )
}

function FavRowSkeleton() {
  return (
    <div className="flex items-center gap-3 h-[90px]" aria-hidden="true">
      <Skeleton className="shrink-0 h-4 w-4 rounded-[4px]" />
      <Skeleton className="shrink-0 w-[70px] h-[70px] rounded-[15px]" />
      <div className="flex-1 flex flex-col gap-[8px]">
        <Skeleton className="h-[16px] w-[120px] rounded" />
        <Skeleton className="h-[16px] w-[72px] rounded" />
      </div>
      <Skeleton className="shrink-0 h-[16px] w-[16px] rounded" />
    </div>
  )
}

function FavRow({ product, checked, removing, disabled, soldOut, onToggle, onRemove, onOpen }) {
  return (
    <div
      className={
        'flex items-center gap-3 h-[90px] transition-opacity duration-200 ' +
        (removing ? 'opacity-50' : 'opacity-100')
      }
    >
      <CheckBox
        id={`favorite-${product.id}`}
        checked={checked}
        disabled={soldOut}
        onChange={onToggle}
        label={`Select ${product.name}`}
      />
      <button
        className="relative shrink-0 w-[70px] h-[70px] p-0 border-none bg-[#f9f8f6] rounded-[15px] overflow-hidden cursor-pointer"
        type="button"
        aria-label={`查看 ${product.name}`}
        onClick={onOpen}
      >
        <img
          className="absolute inset-0 m-auto max-h-[48px] max-w-[48px] object-contain pointer-events-none"
          src={product.image}
          alt={product.name}
        />
      </button>
      <button
        className="flex-1 min-w-0 p-0 border-none bg-none text-left cursor-pointer"
        type="button"
        onClick={onOpen}
      >
        <span className="flex items-center gap-[6px]">
          <span className="min-w-0 text-sm font-medium leading-5 text-black truncate">{product.name}</span>
          {soldOut && <SoldOutTag />}
        </span>
        <span className="mt-[7px] block text-[15px] font-medium leading-5 text-black">
          {product.price}
        </span>
      </button>
      <button
        className="shrink-0 p-0 border-none bg-none cursor-pointer text-base leading-none text-[#b6bbb9] disabled:opacity-40 disabled:cursor-not-allowed"
        type="button"
        aria-label={`取消收藏 ${product.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

function Favorites() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const addItems = useCartStore((s) => s.addItems)
  const removeFavorites = useRemoveFavorites()

  // 收藏只是商品列表接口的一个过滤字段，搜索则是再叠一个 q
  const keyword = query.trim()
  const {
    data = [], sentinelRef, isPending, isError, error, refetch,
    hasNextPage, isFetchingNextPage, isPlaceholderData,
  } = useInfiniteProducts({ favorite: true, q: keyword }, 6)

  const buyable = data.filter((p) => p.stock > 0)
  const selectedIds = buyable.filter((p) => selected.has(p.id)).map((p) => p.id)
  const selectedTotal = selectedIds.reduce(
    (sum, id) => sum + parsePrice(buyable.find((p) => p.id === id).price),
    0
  )
  const allSelected = buyable.length > 0 && selectedIds.length === buyable.length

  const setQueryAndReset = (value) => {
    setQuery(value)
    // 选中集只针对当前可见的这批，换关键词就作废，避免把没看到的商品一起操作掉
    setSelected((prev) => (prev.size === 0 ? prev : new Set()))
    if (notice) setNotice(null)
  }

  const toggleItem = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(buyable.map((p) => p.id)))

  const addSelected = async () => {
    setBusy(true)
    try {
      await addItems(selectedIds.map((id) => ({ product_id: id, qty: 1 })))
      setSelected(new Set())
      setNotice({ ok: true, text: '已加入购物车' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : '加入购物车失败，请重试' })
    } finally {
      setBusy(false)
    }
  }

  const removeOne = (product) => {
    setRemovingId(product.id)
    removeFavorites.mutate(
      [product.id],
      {
        onSuccess: () => {
          setSelected((prev) => {
            if (!prev.has(product.id)) return prev
            const next = new Set(prev)
            next.delete(product.id)
            return next
          })
          setNotice({ ok: true, text: `已取消收藏 ${product.name}` })
        },
        onError: (err) =>
          setNotice({ ok: false, text: err instanceof Error ? err.message : '取消收藏失败，请重试' }),
        onSettled: () => setRemovingId(null),
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[110px] overflow-x-clip">
      <PageHeader title="Wishlist" size="sm" back="/profile" />

      <div className="relative flex items-center gap-[15px] h-[39px] mt-2 mx-[30px] pl-4 pr-10 bg-[#f8f8f8] rounded-[15px]">
        <SearchIcon color="#C1C7D0" />
        <input
          className="flex-1 min-w-0 w-full border-none bg-none outline-none text-sm leading-5 text-black placeholder:text-[#7a869a]/50"
          type="text"
          placeholder="在收藏中搜索"
          aria-label="Search favorites"
          value={query}
          onChange={(e) => setQueryAndReset(e.target.value)}
        />
        {keyword && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 border-none bg-none p-0 cursor-pointer"
            type="button"
            aria-label="Clear search"
            onClick={() => setQueryAndReset('')}
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {notice && (
        <p
          className={`m-0 mt-3 px-[30px] text-sm leading-5 ${notice.ok ? 'text-[#00b861]' : 'text-[#ff7465]'}`}
          role="status"
        >
          {notice.text}
        </p>
      )}

      {isError && <QueryError error={error} onRetry={refetch} className="mt-6 mx-[30px]" />}
      {isPending && (
        <div className="mt-4 px-[29px]">
          {Array.from({ length: 4 }, (_, i) => (
            <FavRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!isPending && !isError && data.length === 0 && (
        <div className="flex flex-col items-center pt-[160px]">
          <p className="text-sm text-[#b6bbb9]">{keyword ? '收藏里没有匹配的商品' : '还没有收藏任何商品'}</p>
          <button
            className="mt-4 px-6 h-9 rounded-full bg-[#00b861] border-none text-sm text-white cursor-pointer"
            type="button"
            onClick={() => navigate('/shop')}
          >
            去逛逛
          </button>
        </div>
      )}

      {data.length > 0 && (
        <>
          <div
            className={
              'mt-4 px-[29px] transition-opacity duration-200 ' +
              (isPlaceholderData ? 'opacity-50' : 'opacity-100')
            }
          >
            {data.map((p) => (
              <FavRow
                key={p.id}
                product={p}
                checked={selected.has(p.id)}
                removing={removingId === p.id}
                disabled={removeFavorites.isPending}
                soldOut={p.stock <= 0}
                onToggle={() => toggleItem(p.id)}
                onRemove={() => removeOne(p)}
                onOpen={() => navigate(`/product/${p.id}`)}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="px-[29px]">
              {Array.from({ length: 2 }, (_, i) => (
                <FavRowSkeleton key={i} />
              ))}
            </div>
          )}
          {!hasNextPage && !isPlaceholderData && !isFetchingNextPage && (
            <p className="mt-4 text-sm text-center text-[#b6bbb9]">没有更多了</p>
          )}

          <div className="mt-1 mx-[29px] h-px bg-[#eeeeee]" />
          <div className="mt-4 px-[29px] flex items-center justify-between text-sm text-[#b6bbb9]">
            <div className="flex items-center gap-2">
              <CheckBox id="select-all" checked={allSelected} onChange={toggleAll} label="Select all" />
              <label htmlFor="select-all" className="cursor-pointer">
                全选 ({buyable.length} 件)
              </label>
            </div>
            <span>
              合计{' '}
              <span className="text-base font-medium text-black tabular-nums">
                ${selectedTotal.toFixed(2)}
              </span>
            </span>
          </div>
        </>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#f4f5f7] px-[29px] pt-[16px] pb-[20px]">
        <button
          className="w-full h-[51px] rounded-full bg-[#00b861] border-none text-base font-bold text-white cursor-pointer hover:brightness-110 active:brightness-90 disabled:bg-[#e4e4e4] disabled:text-[#b6bbb9] disabled:cursor-not-allowed"
          type="button"
          disabled={selectedIds.length === 0 || busy}
          onClick={addSelected}
        >
          {busy
            ? '加入中…'
            : selectedIds.length > 0
              ? `一键加入购物车 (${selectedIds.length})`
              : '一键加入购物车'}
        </button>
      </div>
    </div>
  )
}

export default Favorites
