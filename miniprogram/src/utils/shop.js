import Taro from '@tarojs/taro'
import { fetchNearbyStores, selectStore } from '../api'

// 买家当前在哪一家门店只记在服务端会员身上，端上要靠附近门店列表里的 current 才知道。
// 这份列表在一次运行里基本不变（门店页切店会重进首页），所以取一次缓存着，切店时顺手改它
let snapshot = null

/**
 * 给「可能永远不回调」的平台 API 一个期限：超时按失败处理。
 * 游客 appid 与隐私协议未通过时，wx.login / wx.getLocation 既不成功也不失败，
 * 不限时就会把等它的调用方（登录后的落店、登录页的静默登录）永久挂住
 */
export function withDeadline(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('操作超时')), ms)
    }),
  ])
}

/** 定位只用于落店与排序：被拒是常态，拿不到就返回 null 走兜底 */
export async function locate() {
  try {
    const res = await withDeadline(Taro.getLocation({ type: 'gcj02' }), 3000)
    return { longitude: res.longitude, latitude: res.latitude }
  } catch {
    return null
  }
}

function applySelected(id, name) {
  const names = snapshot ? snapshot.names : {}
  names[id] = name
  snapshot = { currentId: id, names }
}

async function load() {
  const data = await fetchNearbyStores({})
  const list = data.list || []
  const names = {}
  list.forEach((item) => {
    names[item.id] = item.name
  })
  const current = list.find((item) => item.current) || null
  snapshot = { currentId: current ? current.id : '', names }
  return snapshot
}

/** 当前门店 id：拿不到定位也不影响，列表里总有一条 current */
export async function currentStoreId() {
  if (snapshot) return snapshot.currentId
  try {
    return (await load()).currentId
  } catch {
    return ''
  }
}

/** 门店名：只从缓存过的附近列表里取，没取到过就用通用说法，不给端上留空标签 */
export function storeName(storeId) {
  const names = snapshot ? snapshot.names : null
  return (names && names[storeId]) || '另一家门店'
}

/**
 * 加购前把门店对齐到商品所属的门店：购物车与订单都按门店独立，跨店加购会被服务端整批拒掉，
 * 先自动切过去比报错更贴近用户点的这颗按钮。返回切换到的门店名，没切换时返回空串
 */
export async function ensureStore(storeId) {
  if (!storeId) return ''
  if ((await currentStoreId()) === storeId) return ''
  const selected = await selectStore(storeId)
  applySelected(selected.id, selected.name)
  return selected.name || storeName(storeId)
}

/** 门店页的切店：走同一个写口，缓存才不会停留在上一家店 */
export async function switchStore(storeId, coords) {
  const selected = await selectStore(storeId, coords || {})
  applySelected(selected.id, selected.name)
  return selected
}

/**
 * 落店规则「定位最近营业店」：只在登录成功那一次调用（注册页跳回登录页，也归到这一次），之后不再自动改（切店是门店页的活）
 * 拿不到定位、列表为空、最近的就是当前店都原样返回空串；休息中的店不能下单，跳过
 */
export async function alignStoreByLocation() {
  const coords = await locate()
  if (!coords) return ''
  const { list } = await fetchNearbyStores(coords)
  const nearest = (list || []).find((item) => item.status === 'open')
  if (!nearest || nearest.current) return ''
  const selected = await selectStore(nearest.id, coords)
  applySelected(selected.id, selected.name)
  return selected.name || nearest.name
}
