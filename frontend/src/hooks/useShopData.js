import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  fetchCategories,
  fetchProducts,
  fetchCategory,
  fetchProductDetail,
  fetchOrders,
  fetchVouchers,
  redeemVoucher,
  fetchHomeCarousel,
  checkoutPreview,
  toggleFavorite,
  removeFavorites,
} from '../api'

function useSentinelLoader({ hasNextPage, isFetchingNextPage, fetchNextPage }) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '120px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return sentinelRef
}

// 所有商品列表都走 fetchProducts，因此 key 只有这一段：过滤字段即是缓存维度
export function useProducts(params, pageSize = 10) {
  return useQuery({
    queryKey: ['products', params, pageSize],
    queryFn: () => fetchProducts({ ...params, pageSize }),
    select: (data) => data.list,
  })
}

export function useHomeCarousel() {
  return useQuery({
    queryKey: ['homeCarousel'],
    queryFn: fetchHomeCarousel,
  })
}

export function useTopCategories(pageSize = 12) {
  return useQuery({
    queryKey: ['categoriesFirstPage', pageSize],
    queryFn: () => fetchCategories({ page: 1, pageSize }).then((d) => d.list),
  })
}

export function useInfiniteProducts(params, pageSize = 8, enabled = true) {
  // 缓存形状与单页版不同（pages 数组），所以 key 前缀必须分开
  const query = useInfiniteQuery({
    queryKey: ['productPages', params, pageSize],
    queryFn: ({ pageParam }) => fetchProducts({ ...params, page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    select: (data) => data.pages.flatMap((p) => p.list),
    // 换过滤字段（子类目、关键词）时先留着上一批，页面不会被骨架屏整块掀掉
    placeholderData: keepPreviousData,
    enabled,
  })

  const sentinelRef = useSentinelLoader(query)
  return { ...query, sentinelRef }
}

export function useInfiniteCategories(pageSize = 8) {
  const query = useInfiniteQuery({
    queryKey: ['categories'],
    queryFn: ({ pageParam }) => fetchCategories({ page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    select: (data) => data.pages.flatMap((p) => p.list),
  })

  const sentinelRef = useSentinelLoader(query)
  return { ...query, sentinelRef }
}

export function useCategory(id) {
  return useQuery({
    queryKey: ['category', id],
    queryFn: () => fetchCategory(id),
    enabled: Boolean(id),
  })
}

export function useProductDetail(id) {
  return useQuery({
    queryKey: ['productDetail', id],
    queryFn: () => fetchProductDetail(id),
  })
}

export function useOrders(tab, pageSize = 6) {
  const query = useInfiniteQuery({
    queryKey: ['ordersInfinite', tab],
    queryFn: ({ pageParam }) => fetchOrders({ tab, page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    select: (data) => ({
      total: data.pages[0].total,
      items: data.pages.flatMap((p) => p.list),
    }),
    // 切 On going / History 时同样留住上一批，列表不被骨架屏掀掉
    placeholderData: keepPreviousData,
  })

  const sentinelRef = useSentinelLoader(query)
  return { ...query, sentinelRef }
}

// 收藏改动会同时影响列表卡片的心形状态与详情页，两类列表 key 加上详情都要失效
function invalidateProducts(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['products'] })
  queryClient.invalidateQueries({ queryKey: ['productPages'] })
  queryClient.invalidateQueries({ queryKey: ['productDetail'] })
}

export function useFavoriteToggle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => invalidateProducts(queryClient),
  })
}

export function useRemoveFavorites() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeFavorites,
    onSuccess: () => invalidateProducts(queryClient),
  })
}

// 收藏数不再单开端点：统一列表接口的 total 就是它，pageSize 1 只为把计数取回来
export function useFavoriteCount() {
  return useQuery({
    queryKey: ['products', { favorite: true }, 1],
    queryFn: () => fetchProducts({ favorite: true, pageSize: 1 }),
    select: (data) => data.total,
  })
}

export function useVouchers() {
  return useQuery({
    queryKey: ['vouchers'],
    // 不能直接传 fetchVouchers：react-query 会把查询上下文当第一个入参塞进来，
    // 那正是本函数要收的购物车金额，上下文会被拼成 ?amount[signal]=... 这种脏参数
    queryFn: () => fetchVouchers(),
  })
}

export function useRedeemVoucher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: redeemVoucher,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vouchers'] }),
  })
}

/** 结算试算：金额、运费、收货地址全部由后端算，前端只展示 */
export function useCheckoutPreview({ addressId, itemIds, enabled = true }) {
  return useQuery({
    queryKey: ['checkoutPreview', addressId, itemIds],
    queryFn: () => checkoutPreview({ address_id: addressId, item_ids: itemIds }),
    enabled,
  })
}
