/**
 * 卡片上的售罄态标记：无货的商品不给加购按钮，换成这枚标记
 * 加购接口对售罄是整批 422，让按钮可点而静默失败会让人以为下单成功了
 */
export default function SoldOutBadge({ className = '' }) {
  return (
    <span
      className={`flex items-center justify-center text-center leading-4 text-[#ff7465] ${className}`}
      aria-label="已售罄"
    >
      售罄
    </span>
  )
}
