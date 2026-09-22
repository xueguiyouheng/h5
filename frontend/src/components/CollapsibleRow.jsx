import Chevron from './Chevron'
import { ValueSkeleton } from './Skeleton'

export default function CollapsibleRow({
  label,
  value,
  valueLoading = false,
  open,
  onToggle,
  labelClassName = 'text-black',
  rowPadding = 'py-[10px]',
  children,
}) {
  return (
    <>
      <button
        className={`flex w-full items-center gap-3 border-none bg-none ${rowPadding} pl-[19px] pr-[11px] text-left cursor-pointer`}
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={`min-w-0 flex-1 text-sm font-medium leading-5 tracking-[-0.2px] ${labelClassName}`}>
          {label}
        </span>
        {valueLoading ? <ValueSkeleton /> : value && <span className="shrink-0 text-xs text-[#8b8b8b]">{value}</span>}
        <Chevron color="#000" className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
      </button>
      {open && <div className="pb-[14px] pl-[19px] pr-[11px]">{children}</div>}
    </>
  )
}
