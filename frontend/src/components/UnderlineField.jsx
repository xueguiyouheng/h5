export default function UnderlineField({
  name,
  label,
  type = 'text',
  icon,
  iconClass,
  value,
  onChange,
  onFocusField,
  active,
  error,
  autoComplete,
  right,
}) {
  return (
    <div className="relative h-[28px]">
      <span className="absolute left-[8px] top-0 flex h-[18px] w-[22px] items-center justify-center">
        <img className={iconClass} src={icon} alt="" />
      </span>
      <span className="absolute left-[37px] top-[-2px] h-[25.5px] w-px bg-[#f4f5f7]" />
      <input
        id={name}
        name={name}
        type={type}
        placeholder={label}
        value={value}
        onChange={onChange}
        onFocus={onFocusField}
        autoComplete={autoComplete}
        className="absolute left-[56px] right-0 top-0 h-[18px] border-none bg-transparent p-0 text-xs font-medium leading-[18px] tracking-[-0.2px] text-black outline-none placeholder:text-[#b6bbb9]"
      />
      {right}
      <span className="absolute bottom-0 left-0 right-0 h-px bg-[#f4f5f7]" />
      {active && <span className="absolute bottom-0 left-[1px] h-px w-[50px] bg-[#c1c7d0]" />}
      {error && (
        <span className="absolute left-[56px] top-[31px] text-[10px] leading-[14px] text-[#f50000]">{error}</span>
      )}
    </div>
  )
}
