// 商城接口层：从 frontend/src/api/index.js 整文件移植（2026-09-23），字段映射与文案拼装口径与 H5 一致
// 只有三处因端能力而不同，改这份文件时三处都要看：
//   1) 图片地址要补全（absAsset）——小程序没有同源，后端存的是 /uploads/xxx 相对路径
//   2) 上传走平台的上传通道——小程序没有 FormData
//   3) 注册这类「还没有身份」的调用走 rawRequest——request 会先静默登录，未绑手机号时那一步直接抛 NeedsPhoneAuth，
//      注册请求根本发不出去（登录/绑定同理，见 utils/auth.js）
// 金额/时间等展示文案在这里统一拼装，页面不再自己求和
import request, { absAsset, rawRequest, uploadFile } from '../utils/request'

const CURRENCY_SYMBOL = { USD: '$' }

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad2 = (n) => String(n).padStart(2, '0')

/** 解析 "$4.99 / kg" / "4.99" 这类金额为数字 */
export function parseMoney(value) {
  const matched = String(value ?? '').match(/[\d.]+/)
  return matched ? Number(matched[0]) : 0
}

/** 单价 + 币种 + 单位 → 卡片上的展示文案 */
export function priceLabel(product) {
  const symbol = CURRENCY_SYMBOL[product.currency] ?? '$'
  const unit = String(product.unit ?? '').replace(/^per\s+/i, '')
  return unit ? `${symbol}${product.price} / ${unit}` : `${symbol}${product.price}`
}

/** 去掉单位的金额文案，详情页用 */
export function priceOnly(product) {
  return `${CURRENCY_SYMBOL[product.currency] ?? '$'}${product.price}`
}

/** 金额字符串 + 币种 → 展示文案，支付单这类没有单位的场景用 */
export function moneyLabel(amount, currency = 'USD') {
  return `${CURRENCY_SYMBOL[currency] ?? '$'}${amount}`
}

function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? String(iso ?? '') : date
}

/** 下单卡片上的 "06 Feb, 15:30" */
export function formatOrderDate(iso) {
  const date = formatDate(iso)
  if (typeof date === 'string') return date
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 券面到期日 "30 April 2027" */
export function formatExpiredDate(value) {
  const date = formatDate(value)
  if (typeof date === 'string') return date
  return `${date.getDate()} ${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`
}

/** 距今整天数，通知页的相对时间仍按周几/日+月渲染 */
export function daysAgoOf(iso) {
  const date = formatDate(iso)
  if (typeof date === 'string') return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

// 后端分页是 page_size 且无 hasMore，这里补齐页面已在用的 pageSize / hasMore
function toPageResult(data, mapper) {
  const list = (data?.list ?? []).map(mapper ?? ((item) => item))
  const page = data?.page ?? 1
  const pageSize = data?.page_size ?? list.length
  return { list, page, pageSize, total: data?.total ?? list.length, hasMore: page * pageSize < (data?.total ?? 0) }
}

function toProductCard(product) {
  return {
    id: product.id,
    name: product.name,
    price: priceLabel(product),
    priceValue: parseMoney(product.price),
    image: absAsset(product.image_url),
    badge: product.badge ?? null,
    oldPrice: product.old_price ? `${CURRENCY_SYMBOL[product.currency] ?? '$'}${product.old_price}` : null,
    collected: product.collected === true,
    stock: product.stock ?? 0,
    storeId: product.store_id ?? '',
  }
}

function toCategory(category) {
  return {
    id: category.id,
    label: category.label,
    image: absAsset(category.image_url),
    productCount: category.product_count ?? 0,
    subcategories: category.subcategories ?? ['All'],
  }
}

function toVoucher(voucher) {
  return {
    ...voucher,
    minSpend: parseMoney(voucher.min_spend),
    expiredAt: formatExpiredDate(voucher.expired_at),
    gapValue: parseMoney(voucher.gap_amount),
    usable: voucher.usable !== false,
  }
}

function toOrderItem(item) {
  return {
    id: item.product_id,
    name: item.name,
    image: absAsset(item.image_url),
    unitPrice: parseMoney(item.unit_price),
    qty: item.qty,
    lineTotal: parseMoney(item.line_total),
  }
}

function toOrder(order) {
  return {
    ...order,
    date: formatOrderDate(order.date),
    address: order.address_label || '默认地址',
    total: parseMoney(order.total),
    subtotalValue: parseMoney(order.subtotal),
    // 小程序的订单详情要逐行列配送费与优惠，字符串金额在端上没法直接算
    deliveryFeeValue: parseMoney(order.delivery_fee),
    discountValue: parseMoney(order.discount),
    items: (order.items ?? []).map(toOrderItem),
  }
}

function toCartItem(item) {
  return {
    id: item.id,
    product_id: item.product_id,
    name: item.name,
    price: priceLabel(item),
    priceValue: parseMoney(item.price),
    image: absAsset(item.image_url),
    qty: item.qty,
    selected: item.selected,
    maxQty: item.max_qty ?? 20,
    available: item.available ?? 0,
    lineTotal: parseMoney(item.line_total),
  }
}

function toCartData(data) {
  return {
    items: (data?.items ?? []).map(toCartItem),
    currency: data?.currency ?? 'USD',
    selectedTotal: parseMoney(data?.selected_total),
    subtotal: parseMoney(data?.subtotal),
    deliveryFee: parseMoney(data?.delivery_fee),
    freeDeliveryThreshold: parseMoney(data?.free_delivery_threshold),
    discount: parseMoney(data?.discount),
    payable: parseMoney(data?.payable),
    appliedVoucherId: data?.applied_voucher_id || '',
  }
}

// ---------- 店铺与商品 ----------

export function fetchHome({ recommendPage = 1, recommendPageSize = 10 } = {}) {
  return request
    .get('/shop/home', { params: { recommend_page: recommendPage, recommend_page_size: recommendPageSize } })
    .then((data) => ({
      greeting: data.greeting,
      carousel: data.carousel ?? [],
      sections: (data.sections ?? []).map((section) => ({
        key: section.key,
        title: section.title,
        items: (section.items ?? []).map(toProductCard),
      })),
      recommend: toPageResult(data.recommend, toProductCard),
    }))
}

export function fetchCategories({ page = 1, pageSize = 8 } = {}) {
  return request.get('/shop/categories', { params: { page, page_size: pageSize } }).then((d) => toPageResult(d, toCategory))
}

/** 首页轮播：只回启用项，按 sort 倒序 */
export function fetchHomeCarousel() {
  return request.get('/shop/carousel').then((data) =>
    (data.list ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      image: absAsset(item.image_url),
      link: item.link ?? '',
    }))
  )
}

/**
 * 商品列表唯一入口：搜索页、类目页、首页版块、收藏页都调它，只是过滤字段不同
 * @param {object} filters q 关键词 / categoryId 类目 / subcategory 子类目名 / section 运营版块 /
 *                         favorite 只看收藏 / sort 'sales' 销量倒序（留空按运营排序）
 */
export function fetchProducts({
  q = '',
  categoryId = '',
  subcategory = '',
  section = '',
  favorite = false,
  sort = '',
  page = 1,
  pageSize = 10,
} = {}) {
  const params = { page, page_size: pageSize }
  if (q) params.q = q
  if (categoryId) params.category_id = categoryId
  if (subcategory) params.subcategory = subcategory
  if (section) params.section = section
  if (favorite) params.favorite = 'true'
  if (sort) params.sort = sort
  return request.get('/shop/products', { params }).then((d) => toPageResult(d, toProductCard))
}

/** 类目元信息（标题与子类目 tab），类目下的商品走 fetchProducts 的 categoryId 过滤 */
export function fetchCategory(id) {
  return request.get(`/shop/categories/${encodeURIComponent(id)}`).then(toCategory)
}

export function fetchHotSearch() {
  return request.get('/shop/search/hot').then((data) => ({
    keywords: data.keywords ?? [],
    categories: (data.categories ?? []).map(toCategory),
  }))
}

export function fetchProductDetail(id) {
  return request.get(`/shop/products/${id}`).then((data) => ({
    id: data.id,
    name: data.name,
    price: priceOnly(data),
    priceValue: parseMoney(data.price),
    unit: data.unit,
    currency: data.currency,
    image: absAsset(data.image_url),
    heroImage: absAsset(data.hero_image_url || data.image_url),
    images: (data.images ?? []).map(absAsset),
    description: data.description,
    nutrition: data.nutrition,
    stock: data.stock,
    categoryId: data.category_id,
    collected: data.collected === true,
    storeId: data.store_id ?? '',
    related: (data.related ?? []).map(toProductCard).map((card) => ({ ...card, price: card.price.split(' / ')[0] })),
  }))
}

// ---------- 收藏 ----------

/** 收藏与取消收藏同一个入口，回切换后的状态与收藏总数 */
export function toggleFavorite(productId) {
  return request.post('/shop/favorites', { product_id: productId })
}

/** 取消收藏，可单个（收藏页行尾 ×）也可批量 */
export function removeFavorites(productIds) {
  return request.delete('/shop/favorites', { data: { product_ids: productIds } })
}

// ---------- 购物车 ----------

export function fetchCart(voucherId = '') {
  return request.get('/cart', { params: voucherId ? { voucher_id: voucherId } : {} }).then(toCartData)
}

export function addCartItem(productId, qty = 1) {
  return request.post('/cart/items', { product_id: productId, qty }).then(toCartData)
}

/** 批量加入购物车（收藏页「一键加入购物车」）；任一条不合规整批不生效 */
export function addCartItemsBatch(items) {
  return request.post('/cart/items/batch', { items }).then(toCartData)
}

export function setCartItemQty(itemId, qty) {
  return request.patch(`/cart/items/${encodeURIComponent(itemId)}`, { qty }).then(toCartData)
}

export function removeCartItem(itemId) {
  return request.delete(`/cart/items/${encodeURIComponent(itemId)}`).then(toCartData)
}

export function selectCartItems({ all, item_ids } = {}) {
  return request.put('/cart/selection', all === undefined ? { item_ids } : { all, item_ids }).then(toCartData)
}

export function clearCartItems() {
  return request.delete('/cart').then(toCartData)
}

export function checkoutPreview({ address_id = '', voucher_id = '', item_ids } = {}) {
  const body = { item_ids }
  if (address_id) body.address_id = address_id
  if (voucher_id) body.voucher_id = voucher_id
  return request
    .post('/cart/checkout-preview', body)
    .then((data) => ({
      ...toCartData(data),
      address: data.address ? toAddress(data.address) : null,
      eta: data.eta,
      voucherRejectedReason: data.voucher_rejected_reason ?? '',
    }))
}

// ---------- 优惠券 ----------

export function fetchVouchers(amount) {
  return request
    .get('/vouchers', { params: amount === undefined || amount === null ? {} : { amount } })
    .then((data) => (data.list ?? []).map(toVoucher))
}

export function redeemVoucher(code) {
  const normalized = String(code).trim().toUpperCase()
  if (!normalized) return Promise.reject(new Error('请输入兑换码'))
  return request.post('/vouchers/redeem', { code: normalized }).then(toVoucher)
}

// ---------- 门店（卖家的店，与买家收货地址是两回事） ----------

function toStore(item) {
  return {
    id: item.id,
    name: item.name,
    address: item.address ?? '',
    phone: item.phone ?? '',
    notice: item.notice ?? '',
    status: item.status,
    minOrderAmount: parseMoney(item.min_order_amount),
    distanceText: item.distance_text ?? '',
    outOfRange: Boolean(item.out_of_range),
    current: Boolean(item.current),
  }
}

/** 附近门店：经纬度留空时服务端用会员上次定位；未定位则按创建顺序返回 */
export function fetchNearbyStores({ longitude, latitude, keyword = '' } = {}) {
  const params = {}
  if (longitude) params.longitude = longitude
  if (latitude) params.latitude = latitude
  if (keyword) params.keyword = keyword
  return request.get('/shop/stores/nearby', { params }).then((data) => ({
    list: (data.list ?? []).map(toStore),
    located: Boolean(data.located),
  }))
}

/** 切换当前门店，之后列表/购物车/订单都归属这家店；坐标顺带缓存到会员 */
export function selectStore(storeId, { longitude = 0, latitude = 0 } = {}) {
  return request
    .put('/shop/stores/selection', { store_id: storeId, longitude, latitude })
    .then((data) => ({ id: data.store_id, name: data.name, outOfRange: Boolean(data.out_of_range) }))
}

// ---------- 收货地址 ----------

function toAddress(address) {
  return { id: address.id, label: address.label, detail: address.detail, isDefault: address.is_default }
}

export function fetchAddresses() {
  return request.get('/addresses').then((data) => ({
    list: (data.list ?? []).map(toAddress),
    defaultId: data.default_id ?? null,
  }))
}

export function createAddress({ label, detail, asDefault = false }) {
  return request.post('/addresses', { label, detail, as_default: asDefault })
}

export function updateAddress(id, patch) {
  return request.patch(`/addresses/${encodeURIComponent(id)}`, patch)
}

export function deleteAddress(id) {
  return request.delete(`/addresses/${encodeURIComponent(id)}`)
}

export function setDefaultAddress(id) {
  return request.put(`/addresses/${encodeURIComponent(id)}/default`)
}

// ---------- 订单 ----------

export function fetchOrders({ tab = 'ongoing', page = 1, pageSize = 6 } = {}) {
  return request.get('/orders', { params: { tab, page, page_size: pageSize } }).then((d) => toPageResult(d, toOrder))
}

export function fetchOrderDetail(id) {
  return request.get(`/orders/${encodeURIComponent(id)}`).then(toOrder)
}

export function createOrder({ address_id = '', voucher_id = '', item_ids = [], payment_method = '' } = {}) {
  return request.post('/orders', { address_id, voucher_id, item_ids, payment_method })
}

export function cancelOrder(id) {
  return request.post(`/orders/${encodeURIComponent(id)}/cancel`).then(toOrder)
}

export function fetchOrderTrack(id) {
  return request.get(`/orders/${encodeURIComponent(id)}/track`)
}

// ---------- 通知 ----------

function toNotification(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description,
    link: { to: item.link?.route ?? '/shop', label: item.link?.label ?? '' },
    createdAt: item.created_at,
    daysAgo: daysAgoOf(item.created_at),
    read: item.read === true,
  }
}

export function fetchNotifications({ page = 1, pageSize = 20 } = {}) {
  return request.get('/notifications', { params: { page, page_size: pageSize } }).then((d) => toPageResult(d, toNotification))
}

export function fetchUnreadCount() {
  return request.get('/notifications/unread-count').then((data) => data.count ?? 0)
}

export function markNotificationsRead(ids) {
  return request.post('/notifications/read', { ids })
}

export function markAllNotificationsRead() {
  return request.post('/notifications/read-all')
}

// ---------- 帮助与客服 ----------

function toFaq(faq) {
  return {
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    link: { to: faq.link?.route ?? '/shop', label: faq.link?.label ?? '' },
    myVote: faq.my_vote ?? null,
  }
}

export function fetchFaqs() {
  return request.get('/help/faqs').then((data) => ({
    list: (data.list ?? []).map(toFaq),
    support: data.support ?? {},
  }))
}

export function voteFaq(id, helpful) {
  return request.post(`/help/faqs/${encodeURIComponent(id)}/vote`, { helpful })
}

function toMessage(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.text ?? '',
    file:
      message.content_type === 'image'
        ? { name: message.media_name || (message.media_url ?? '').split('/').pop(), size: Math.round((message.media_size ?? 0) / 1024), url: message.media_url }
        : undefined,
    link: message.link ? { to: message.link.route, label: message.link.label } : undefined,
    createdAt: message.created_at,
  }
}

export function fetchChatMessages({ cursor = '', limit = 30 } = {}) {
  return request.get('/chat/messages', { params: { cursor, limit } }).then((data) => ({
    list: (data.list ?? []).map(toMessage),
    nextCursor: data.next_cursor ?? '',
  }))
}

export function sendChatMessage({ text = '', file }) {
  const body = file
    ? { content_type: 'image', media_url: file.url, media_name: file.name, media_size: file.size }
    : { content_type: 'text', text }
  return request.post('/chat/messages', body).then((data) => ({ message: toMessage(data.message), reply: toMessage(data.reply), typing: data.typing !== false }))
}

export function clearChatHistory() {
  return request.delete('/chat/messages')
}

export function fetchSupportStatus() {
  return request.get('/support/status').then((data) => ({
    online: data.online === true,
    nextOpenLabel: data.next_open_label ?? '',
    openLabel: data.open_label ?? '',
    timezone: data.timezone ?? 'GMT+8',
  }))
}

// ---------- 账号 / 资料 / 设置 ----------

function toProfile(member) {
  return {
    id: member.id,
    username: member.username ?? '',
    email: member.email ?? '',
    mobile: member.mobile ?? '',
    gender: member.gender ? String(member.gender).replace(/^\w/, (c) => c.toUpperCase()) : '',
    avatar: absAsset(member.avatar_url),
    onboarded: member.onboarded === true,
    isAdmin: member.is_admin === true,
    createdAt: member.created_at,
  }
}

export function fetchProfile() {
  return request.get('/profile').then(toProfile)
}

export function updateProfile(patch) {
  return request.put('/profile', patch).then(toProfile)
}

export function fetchCompleteness() {
  return request.get('/profile/completeness')
}

export function fetchSettings() {
  return request.get('/settings').then((data) => ({
    language: data.language ?? 'en',
    ratings: (data.ratings ?? []).map((item) => item.value),
    ratingAverage: data.rating_average ?? 0,
    ratingCount: data.rating_count ?? 0,
  }))
}

export function saveLanguage(language) {
  return request.put('/settings', { language })
}

export function submitRating(value) {
  return request.post('/settings/ratings', { value })
}

export function fetchLegal(key) {
  return request.get(`/legal/${key}`).then((data) => ({ key: data.key, title: data.title, body: data.body }))
}

export function fetchOnboarding() {
  return request.get('/onboarding/slides').then((data) => ({
    list: data.list ?? [],
    stats: data.stats ?? {},
  }))
}

export function completeOnboarding() {
  return request.post('/onboarding/complete')
}
/** 注册：此刻还没有身份，不能走会先静默登录的 request（见文件头第 3 条） */
export async function registerAccount(payload) {
  const { status, body } = await rawRequest('POST', '/register', { data: payload })
  const code = body.code || status
  if (code < 200 || code >= 300) throw new Error(body.message || '注册失败')
  return body.data
}

export function requestPasswordReset(email) {
  return request.post('/auth/password/reset', { email })
}

export function verifyPasswordReset(payload) {
  return request.post('/auth/password/reset-verify', payload)
}

/** 图片上传：入参是本地临时文件路径（选图或拍照的返回值），回参与 H5 一致 {url:...} */
export function uploadImage(filePath) {
  return uploadFile('/uploads', filePath)
}
