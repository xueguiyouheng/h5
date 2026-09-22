/** 查询失败占位：给出后端/网络原因，并提供原地重试（一次网络抖动不该让整页死掉） */
export default function QueryError({ error, onRetry, className = '' }) {
  return (
    <p className={`flex flex-wrap items-center gap-2 m-0 text-sm text-[#f50000] ${className}`}>
      <span>加载失败，请重试</span>
      {error?.message && <span className="text-xs text-[#b6bbb9]">{error.message}</span>}
      <button
        className="h-[26px] px-[14px] rounded-full border border-[#e4e4e4] bg-white text-xs font-medium text-[#00b861] cursor-pointer hover:bg-[#f9f8f6]"
        type="button"
        onClick={onRetry}
      >
        重试
      </button>
    </p>
  )
}
