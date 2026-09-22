import { create } from 'zustand'
import * as cartApi from '../api'

export const parsePrice = cartApi.parseMoney

function totalsOf(items) {
  return items
    .filter((i) => i.selected)
    .reduce((sum, i) => sum + (i.priceValue ?? parsePrice(i.price)) * i.qty, 0)
}

// 购物车数据全部来自 /api/cart，本地只保留最近一次服务端返回的行项目
export const useCartStore = create((set, get) => ({
  items: [],
  deliveryFee: 0,
  discount: 0,
  payable: 0,
  freeDeliveryThreshold: 20,
  loading: false,
  error: '',

  applyServer: (data) =>
    set({
      items: data.items ?? [],
      deliveryFee: data.deliveryFee ?? 0,
      discount: data.discount ?? 0,
      payable: data.payable ?? 0,
      freeDeliveryThreshold: data.freeDeliveryThreshold ?? 20,
    }),

  load: async () => {
    set({ loading: true, error: '' })
    try {
      const data = await cartApi.fetchCart()
      get().applyServer(data)
      set({ loading: false })
      return data
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  addItem: async (product, qty = 1) => {
    const data = await cartApi.addCartItem(product.id, qty)
    get().applyServer(data)
    return data
  },

  // 收藏页「一键加入购物车」：一次批量提交，服务端回什么车就长什么样
  addItems: async (items) => {
    const data = await cartApi.addCartItemsBatch(items)
    get().applyServer(data)
    return data
  },

  setQty: async (id, qty) => {
    const data = qty <= 0 ? await cartApi.removeCartItem(id) : await cartApi.setCartItemQty(id, qty)
    get().applyServer(data)
    return data
  },

  removeItem: async (id) => {
    const data = await cartApi.removeCartItem(id)
    get().applyServer(data)
    return data
  },

  // 服务端的 item_ids 是全量覆盖语义，因此每次提交「期望处于选中状态的完整 id 列表」
  toggleSelect: async (id) => {
    const target = get().items.find((i) => i.id === id)
    if (!target) return null
    const selectedIds = get().items
      .filter((i) => (i.id === id ? !i.selected : i.selected))
      .map((i) => i.id)
    const data = await cartApi.selectCartItems({ item_ids: selectedIds })
    get().applyServer(data)
    return data
  },

  selectAll: async (selected) => {
    const data = await cartApi.selectCartItems({ all: !!selected })
    get().applyServer(data)
    return data
  },

  clearCart: async () => {
    const data = await cartApi.clearCartItems()
    get().applyServer(data)
    return data
  },

  checkoutPreview: (payload) => cartApi.checkoutPreview(payload),

  placeOrder: async ({ addressId = '', voucherId = '', paymentMethod = '' } = {}) => {
    const itemIds = get().items.filter((i) => i.selected).map((i) => i.id)
    const result = await cartApi.createOrder({
      address_id: addressId,
      voucher_id: voucherId,
      item_ids: itemIds,
      payment_method: paymentMethod,
    })
    await get().load()
    return result
  },

  totalPrice: () => totalsOf(get().items),
}))
