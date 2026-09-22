// 从购物车页抽出：收藏页也要用同一套选中框视觉
function CheckBox({ id, checked, onChange, label, disabled }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center w-4 h-4">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        disabled={disabled}
        className={`absolute inset-0 m-0 w-full h-full opacity-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      />
      <span
        className={`flex items-center justify-center w-4 h-4 rounded-[4px] border bg-white ${
          disabled ? 'border-[#eeeeee] bg-[#f8f8f8]' : checked ? 'border-[#00b861]' : 'border-[#e4e4e4]'
        }`}
        aria-hidden="true"
      >
        {checked && !disabled && (
          <svg width="10" height="8" viewBox="0 0 10 8">
            <path
              d="M1 4 3.6 6.6 9 1.2"
              fill="none"
              stroke="#00b861"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  )
}

export default CheckBox
