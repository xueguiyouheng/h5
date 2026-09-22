import { useEffect } from 'react'

const INPUT_CLASS =
  'w-full h-9 px-3 rounded-md border border-[#d6dbe1] bg-white text-sm text-[#1f2937] outline-none focus:border-[#00b861] focus:ring-2 focus:ring-[#00b861]/20'

export function Spinner({ label = '加载中...', className = '' }) {
  return (
    <div className={`flex items-center gap-2 text-sm text-[#8b93a1] ${className}`} role="status">
      <span
        className="inline-block w-4 h-4 rounded-full border-2 border-[#00b861]/30 border-t-[#00b861] animate-spin"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  )
}

export function ErrorText({ message = '加载失败，请重试', onRetry }) {
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-md border border-[#fbcaca] bg-[#fef6f6] px-4 py-3" role="alert">
      <span className="text-sm text-[#b42318]">{message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title = '暂无数据', description = '', action = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-[13px] font-medium text-[#6b7280]">{title}</span>
      {description && <span className="text-xs text-[#9aa3af]">{description}</span>}
      {action}
    </div>
  )
}

export function Panel({ title = '', description = '', actions = null, children, className = '' }) {
  return (
    <section className={`bg-white border border-[#e6e9ee] rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-[#eef0f3] md:gap-4 md:px-5 md:py-4">
          <div className="min-w-0">
            {title && <h2 className="m-0 text-[15px] font-semibold text-[#111827]">{title}</h2>}
            {description && <p className="mt-1 mb-0 text-xs text-[#8b93a1]">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  )
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-[#e6e9ee] rounded-lg p-4 md:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {children}
    </div>
  )
}

const BUTTON_VARIANTS = {
  primary: 'bg-[#00b861] text-white border border-[#00b861] hover:bg-[#00a557] disabled:bg-[#9be0c4] disabled:border-[#9be0c4] disabled:text-white',
  danger: 'bg-white text-[#b42318] border border-[#f0b6b1] hover:bg-[#fef6f6] disabled:opacity-50',
  ghost: 'bg-white text-[#374151] border border-[#d6dbe1] hover:bg-[#f7f8fa] disabled:opacity-50',
}

export function Button({ variant = 'primary', type = 'button', size = 'md', disabled = false, className = '', children, ...rest }) {
  const base =
    'inline-flex items-center justify-center gap-1 rounded-md font-medium cursor-pointer transition-colors disabled:cursor-not-allowed'
  const sizing = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-4 text-sm'
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${sizing} ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.ghost} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Field({ label, htmlFor, error = '', hint = '', required = false, children, className = '' }) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="block mb-1.5 text-[13px] font-medium text-[#374151]" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-[#d92d20]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 mb-0 text-xs text-[#9aa3af]">{hint}</p>}
      {error && (
        <p className="mt-1 mb-0 text-xs text-[#b42318]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput({ invalid = false, className = '', ...rest }) {
  return <input className={`${INPUT_CLASS} ${invalid ? 'border-[#d92d20]' : ''} ${className}`} {...rest} />
}

export function TextArea({ invalid = false, rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`${INPUT_CLASS} h-auto py-2 leading-6 ${invalid ? 'border-[#d92d20]' : ''} ${className}`} {...rest} />
}

export function Select({ invalid = false, children, className = '', ...rest }) {
  return (
    <select className={`${INPUT_CLASS} ${invalid ? 'border-[#d92d20]' : ''} ${className}`} {...rest}>
      {children}
    </select>
  )
}

export function Table({ head = [], children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-sm">
        {head.length > 0 && (
          <thead>
            <tr className="bg-[#f7f8fa]">
              {head.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left text-xs font-semibold text-[#6b7280] border-b border-[#e6e9ee] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Tr({ children, className = '' }) {
  return <tr className={`border-b border-[#eef0f3] last:border-b-0 hover:bg-[#fbfcfd] ${className}`}>{children}</tr>
}

export function Td({ children, colSpan, className = '', ...rest }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 align-middle text-[#1f2937] ${className}`} {...rest}>
      {children}
    </td>
  )
}

export function StatusPill({ status }) {
  const on = status === 'on'
  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] rounded-full text-xs font-medium ${
        on ? 'bg-[#e6f8ef] text-[#00894a]' : 'bg-[#f1f3f5] text-[#6b7280]'
      }`}
    >
      {on ? '已上架' : '已下架'}
    </span>
  )
}

// 订单状态徽标：与买家侧 constants/orderStatus.js 分开，中台要的是处理口径
const ORDER_STATUS_META = {
  accepted: { label: '待备货', className: 'bg-[#eef4ff] text-[#3563e9]' },
  ready: { label: '待配送', className: 'bg-[#fff4e5] text-[#b54708]' },
  delivered: { label: '已送达', className: 'bg-[#e6f8ef] text-[#00894a]' },
  cancelled: { label: '已取消', className: 'bg-[#f1f3f5] text-[#6b7280]' },
}

const PAYMENT_STATUS_META = {
  unpaid: { label: '待付款', className: 'bg-[#fef6f6] text-[#b42318]' },
  paid: { label: '已付款', className: 'bg-[#e6f8ef] text-[#00894a]' },
  failed: { label: '支付失败', className: 'bg-[#f1f3f5] text-[#6b7280]' },
}

function Pill({ meta }) {
  return (
    <span className={`inline-flex items-center px-2 h-[22px] rounded-full text-xs font-medium whitespace-nowrap ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export function OrderStatusPill({ status }) {
  return <Pill meta={ORDER_STATUS_META[status] || { label: status || '-', className: 'bg-[#f1f3f5] text-[#6b7280]' }} />
}

export function PaymentStatusPill({ status }) {
  return <Pill meta={PAYMENT_STATUS_META[status] || { label: status || '-', className: 'bg-[#f1f3f5] text-[#6b7280]' }} />
}

export function Modal({ title, onClose, children, footer = null, width = 560 }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111827]/45 overflow-y-auto md:items-start md:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-h-[86vh] overflow-y-auto rounded-t-[16px] bg-white shadow-[0_12px_32px_rgba(16,24,40,0.18)] pb-[env(safe-area-inset-bottom)] md:my-8 md:max-h-none md:overflow-visible md:rounded-lg md:pb-0"
        style={{ width: '100%', maxWidth: width }}
      >
        <div className="h-1 w-9 mx-auto mt-2.5 rounded-full bg-[#d6dbe1] md:hidden" aria-hidden="true" />
        <header className="flex items-center justify-between px-4 py-3.5 border-b border-[#eef0f3] md:px-5 md:py-4">
          <h3 className="m-0 text-[15px] font-semibold text-[#111827]">{title}</h3>
          <button
            type="button"
            aria-label="关闭"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md border-none bg-none text-[#6b7280] text-lg leading-none cursor-pointer hover:bg-[#f1f3f5] md:w-7 md:h-7"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="px-4 py-4 md:px-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eef0f3]">{footer}</footer>}
      </div>
    </div>
  )
}

export function PaginationBar({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / (Number(pageSize) || 1)))
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages)

  return (
    <div className="flex items-center justify-between gap-4 mt-4">
      <span className="text-xs text-[#8b93a1]">
        第 {current} / {totalPages} 页 · 共 {Number(total) || 0} 条
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={current <= 1} onClick={() => onChange(current - 1)}>
          上一页
        </Button>
        <Button variant="ghost" size="sm" disabled={current >= totalPages} onClick={() => onChange(current + 1)}>
          下一页
        </Button>
      </div>
    </div>
  )
}
