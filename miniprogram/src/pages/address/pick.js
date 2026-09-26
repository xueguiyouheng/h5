// 结算页与地址页之间用 storage 传「本次选中的地址」：
// navigateBack 带不了返回值，页面栈外也没有共享状态可用
import Taro from '@tarojs/taro'

const PICK_KEY = 'fm_address_pick'

/** 地址页在 pick 模式下写入选中结果 */
export function writePickedAddress(id) {
  Taro.setStorageSync(PICK_KEY, id || '')
}

/** 取走并清空：读过的选择不该再影响下一次进入结算页 */
export function readPickedAddress() {
  const id = Taro.getStorageSync(PICK_KEY) || ''
  if (id) Taro.removeStorageSync(PICK_KEY)
  return id
}
