import BackIcon from './BackIcon'
import { useGoBack } from '../hooks/useGoBack'

const TITLE_SIZE = { lg: 'text-xl', sm: 'text-base' }

// back：true 走浏览器历史，传路径则是固定的业务上级页面，如 back="/shop"
export default function PageHeader({ title, size = 'lg', align = 'center', right, back = true, children }) {
  const goBack = useGoBack(typeof back === 'string' ? back : undefined)

  return (
    <header className="sticky top-0 z-10 bg-white pt-[54px] pb-[14px]">
      <div className="relative flex h-6 items-center justify-center">
        {back && (
          <button
            className="absolute left-[21px] flex h-6 w-6 items-center justify-center border-none bg-none p-0 cursor-pointer"
            type="button"
            aria-label="Back"
            onClick={goBack}
          >
            <BackIcon />
          </button>
        )}
        {title && (
          <h1
            className={`m-0 font-medium leading-6 text-black ${TITLE_SIZE[size]} ${
              align === 'center' ? 'text-center' : 'absolute left-[30px]'
            }`}
          >
            {title}
          </h1>
        )}
        {right && <div className="absolute right-[29px] flex h-6 items-center gap-[16px]">{right}</div>}
      </div>
      {children}
    </header>
  )
}
