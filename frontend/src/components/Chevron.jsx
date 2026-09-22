export default function Chevron({ color = '#131326', className = '' }) {
  return (
    <svg className={className} width="6" height="10" viewBox="0 0 6 10" aria-hidden="true">
      <path
        d="M1 1 5 5 1 9"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
