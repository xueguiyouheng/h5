import { useNavigate } from 'react-router-dom'

/** 类目大卡（搜索页两列网格，设计稿 149×154）：首页类目是圆底的 CategoryChip，别混用 */
function CategoryTile({ category, className = '' }) {
  const navigate = useNavigate()
  return (
    <div
      className={`relative aspect-[149/154] bg-[#f9f8f6] rounded-[18px] overflow-hidden cursor-pointer ${className}`}
      onClick={() => navigate(`/category/${category.id}`)}
    >
      {/* 图锁在 25/70 的带子里，文案永远在下面两行内，长名称不会被图压住 */}
      <div className="absolute left-[25px] right-[25px] top-[25px] h-[70px] flex items-center justify-center overflow-hidden">
        <img className="max-h-full max-w-full object-contain pointer-events-none" src={category.image} alt={category.label || ''} />
      </div>
      {category.label && (
        <div className="absolute left-[25px] right-[25px] bottom-[21px] text-xs font-medium leading-4 text-[#202020] line-clamp-2">
          {category.label}
        </div>
      )}
    </div>
  )
}

export default CategoryTile
