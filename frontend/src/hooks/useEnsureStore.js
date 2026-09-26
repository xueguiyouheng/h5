import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { currentStore, useShopsStore } from '../stores/shopsStore'
import { useCartStore } from '../stores/cartStore'

/**
 * 加购前把门店对齐到商品所属的门店：一单一店是后端硬约束，跨店加购会被整批拒掉，
 * 自动切过去比报错更贴近用户点的这个按钮。
 * 切店等于换数据归属，和门店面板走同一套收口：列表全部重取，购物车按新店重新读。
 * 返回切换到的门店名，调用方用它提示用户；没切换时返回 null。
 */
export function useEnsureStore() {
  const queryClient = useQueryClient()

  return useCallback(
    async (storeId) => {
      if (!storeId) return null
      const shops = useShopsStore.getState()
      if (!shops.loaded) await shops.load().catch(() => {})
      const list = useShopsStore.getState().list
      if (currentStore(list)?.id === storeId) return null

      const target = list.find((item) => item.id === storeId)
      await useShopsStore.getState().select(storeId)
      queryClient.invalidateQueries()
      await useCartStore.getState().load().catch(() => {})
      return { storeId, storeName: target?.name ?? '对应门店' }
    },
    [queryClient]
  )
}
