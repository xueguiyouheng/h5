/** 骨架屏占位块，颜色与详情页/首页已有的骨架保持一致 */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-[#ededed] ${className}`} aria-hidden="true" />
}

/** 行内值槽位骨架（Profile 菜单行 / Settings 折叠行的右侧文案） */
export function ValueSkeleton({ className = 'h-[12px] w-[64px]' }) {
  return (
    <span
      className={`shrink-0 inline-block rounded animate-pulse bg-[#ededed] ${className}`}
      aria-hidden="true"
    />
  )
}

/** 两列商品卡骨架 */
export function SkeletonTiles({ count = 4, wrapClass = 'grid grid-cols-2 gap-4', tileClass = 'aspect-[159/199] rounded-[18px]' }) {
  return (
    <div className={wrapClass} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={tileClass} />
      ))}
    </div>
  )
}

/** 横滑卡片骨架（首页 Exclusive Offer / Best Selling 尺寸） */
export function SkeletonScrollCards({ count = 2 }) {
  return (
    <div className="flex gap-4 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="shrink-0 basis-[137px] h-[172px] rounded-[15px]" />
      ))}
    </div>
  )
}

/** 「圆徽标 + 两行文字」列表行骨架，通知/FAQ/地址等复用，行内边距由调用方给 */
export function SkeletonListRows({ count = 4, padding = 'py-[6.5px] pl-[30px] pr-[35px]', avatar = 'h-[42px] w-[42px] rounded-full', line = 'w-[210px]' }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`flex items-start gap-[22px] ${padding}`} aria-hidden="true">
          <Skeleton className={`shrink-0 ${avatar}`} />
          <div className={`flex flex-col gap-[6px] ${line}`}>
            <Skeleton className="h-[14px] w-full rounded" />
            <Skeleton className="h-[10px] w-4/5 rounded" />
          </div>
        </div>
      ))}
    </>
  )
}

/** 资料 / 地址页的浅灰卡片骨架：标签行 + 内容行 */
export function SkeletonCards({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex min-h-[83px] flex-col gap-[10px] rounded-[12px] bg-[#f9f8f6] px-[21px] pt-[14px] pb-[16px]"
          aria-hidden="true"
        >
          <Skeleton className="h-[14px] w-[72px] rounded" />
          <Skeleton className="h-[16px] w-[150px] rounded" />
        </div>
      ))}
    </>
  )
}
