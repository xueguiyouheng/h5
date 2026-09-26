import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import './index.scss'

/**
 * 商品卡：首页 / 类目 / 搜索 / 收藏四处共用一份，点开进详情
 * 图与文字上下排布，不让图片压住标题（窄卡尤其要给标签留行数）
 */
export default function ProductCard({ item, showAdd, onAdd }) {
  const soldOut = (item.stock ?? 0) <= 0
  return (
    <View className="card" onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(item.id)}` })}>
      <Image className="card__img" src={item.image} mode="aspectFill" lazyLoad />
      {item.badge ? <Text className="card__badge">{item.badge}</Text>: null}
      <Text className="card__name">{item.name}</Text>
      <View className="card__prices">
        <Text className="card__price">{item.price}</Text>
        {item.oldPrice ? <Text className="card__old">{item.oldPrice}</Text> : null}
      </View>
      {soldOut ? (
        <Text className="card__soldout">售罄</Text>
      ) : (
        showAdd && (
          <View className="card__foot">
            <Text
              className="card__add"
              onClick={(e) => {
                e.stopPropagation()
                if (onAdd) onAdd(item)
              }}
            >
              加购
            </Text>
          </View>
        )
      )}
    </View>
  )
}
