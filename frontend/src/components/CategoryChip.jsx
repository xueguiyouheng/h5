import { useNavigate } from 'react-router-dom'

// 设计稿首页 5 个类目圆底各自一个柔和色，按顺序循环取
const CHIP_TINTS = ['#e5f3ea', '#ffe9e4', '#fff6e4', '#f1edfc', '#ddf5f4']

/** 首页类目：43px 圆底 + 26px 图 + 10px 居中文字，一格 63px（设计稿 5 格正好 315 宽） */
function CategoryChip({ category, index = 0 }) {
  const navigate = useNavigate()
  return (
    <div
      className="shrink-0 w-[63px] flex flex-col items-center cursor-pointer"
      onClick={() => navigate(`/category/${category.id}`)}
    >
      <span
        className="flex h-[43px] w-[43px] items-center justify-center rounded-full overflow-hidden"
        style={{ backgroundColor: CHIP_TINTS[index % CHIP_TINTS.length] }}
      >
        <img className="max-h-[26px] max-w-[26px] object-contain pointer-events-none" src={category.image} alt={category.label || ''} />
      </span>
      <span className="mt-[5px] w-full text-center text-[10px] font-medium leading-6 text-[#b6bbb9] line-clamp-1">
        {category.label}
      </span>
    </div>
  )
}

export default CategoryChip
