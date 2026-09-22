import request from '../utils/request'

const MONEY_SYMBOLS = {
  USD: '$',
  CNY: '¥',
  RMB: '¥',
  MYR: 'RM',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
  HKD: 'HK$',
}

function toAmount(price) {
  const match = String(price ?? '').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const amount = Number.parseFloat(match[0])
  return Number.isFinite(amount) ? amount : null
}

export function formatMoney(price, currency = 'USD', unit = '') {
  const amount = toAmount(price)
  if (amount === null) return ''
  const symbol = MONEY_SYMBOLS[String(currency).toUpperCase()] || `${currency} `
  const trimmedUnit = String(unit).trim().replace(/^per\s+/i, '')
  return trimmedUnit ? `${symbol}${amount.toFixed(2)} / ${trimmedUnit}` : `${symbol}${amount.toFixed(2)}`
}

export function parseMoney(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { price: '', unit: '' }
  const match = raw.match(/\d+(?:\.\d+)?/)
  if (!match) return { price: '', unit: '' }
  const price = match[0]
  const tail = raw.slice(match.index + match[0].length).replace(/^[\s/]+/, '').trim()
  if (tail) return { price, unit: /^per\b/i.test(tail) ? tail : `per ${tail}` }
  const leading = raw.match(/per\s+[\w\u4e00-\u9fa5]+/i)
  return { price, unit: leading ? leading[0] : '' }
}

export function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

export function fetchStats() {
  return request.get('/admin/stats')
}

export function fetchCarousel() {
  return request.get('/admin/carousel')
}

export function createCarouselItem(payload) {
  return request.post('/admin/carousel', payload)
}

export function updateCarouselItem(id, payload) {
  return request.put(`/admin/carousel/${id}`, payload)
}

export function deleteCarouselItem(id) {
  return request.delete(`/admin/carousel/${id}`)
}

export function fetchCategories({ page = 1, pageSize = 20 } = {}) {
  return request.get('/admin/categories', { params: { page, page_size: pageSize } })
}

export function fetchCategory(id) {
  return request.get(`/admin/categories/${id}`)
}

export function createCategory(payload) {
  return request.post('/admin/categories', payload)
}

export function updateCategory(id, payload) {
  return request.put(`/admin/categories/${id}`, payload)
}

export function deleteCategory(id) {
  return request.delete(`/admin/categories/${id}`)
}

export function fetchProducts({ page = 1, pageSize = 20, keyword = '', categoryId = '', status = '' } = {}) {
  return request.get('/admin/products', {
    params: { page, page_size: pageSize, keyword, category_id: categoryId, status },
  })
}

export function fetchProduct(id) {
  return request.get(`/admin/products/${id}`)
}

export function createProduct(payload) {
  return request.post('/admin/products', payload)
}

export function updateProduct(id, payload) {
  return request.put(`/admin/products/${id}`, payload)
}

export function updateProductStatus(id, status) {
  return request.put(`/admin/products/${id}/status`, { status })
}

export function deleteProduct(id) {
  return request.delete(`/admin/products/${id}`)
}

export function uploadImage(file) {
  const form = new FormData()
  form.append('file', file)
  return request.post('/uploads', form)
}
export function fetchUploads({ page = 1, pageSize = 24 } = {}) {
  return request.get('/uploads', { params: { page, page_size: pageSize } })
}

// Contract lists no delete route for uploads; callers must guard on item.id.
export function deleteUpload(id) {
  return request.delete(`/uploads/${id}`)
}

// ---------- 订单处理 ----------

export function fetchOrderSummary() {
  return request.get('/admin/orders/summary')
}

export function fetchOrders({
  page = 1,
  pageSize = 10,
  keyword = '',
  status = '',
  paymentStatus = '',
  since = '',
  until = '',
} = {}) {
  return request.get('/admin/orders', {
    params: {
      page,
      page_size: pageSize,
      keyword,
      status,
      payment_status: paymentStatus,
      since,
      until,
    },
  })
}

export function fetchOrder(id) {
  return request.get(`/admin/orders/${id}`)
}

export function setOrderStatus(id, status, note = '') {
  return request.put(`/admin/orders/${id}/status`, { status, note })
}

export function cancelOrderAsStore(id, reason) {
  return request.post(`/admin/orders/${id}/cancel`, { reason })
}

export function updateOrderRemark(id, adminRemark) {
  return request.put(`/admin/orders/${id}/remark`, { admin_remark: adminRemark })
}

export function updateOrderShipping(id, payload) {
  return request.put(`/admin/orders/${id}/shipping`, payload)
}

// ---------- 门店资料 ----------

export function fetchStoreProfile() {
  return request.get('/admin/store')
}

export function saveStoreProfile(payload) {
  return request.put('/admin/store', payload)
}
