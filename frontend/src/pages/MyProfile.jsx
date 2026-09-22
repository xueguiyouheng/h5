import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { SkeletonCards } from '../components/Skeleton'
import iconEdit from '../assets/my-profile/icon-edit.svg'
import {
  GENDERS,
  formatMobile,
  passwordStrength,
  profileCompleteness,
  useProfileStore,
  validateProfileField,
} from '../stores/profileStore'

const FIELDS = [
  { key: 'username', label: 'Username', type: 'text' },
  { key: 'mobile', label: 'Mobile Number', type: 'tel' },
  { key: 'gender', label: 'Gender', type: 'select' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'password', label: 'Password', type: 'password' },
]

function displayValue(key, raw) {
  if (key === 'mobile') return formatMobile(raw)
  if (key === 'password') return null
  return raw
}

function ProfileCard({ field, raw, editing, error, onEdit, onDraft, onCancel, onSave }) {
  const strength = passwordStrength(raw)
  const value = displayValue(field.key, raw)

  return (
    <div className="flex min-h-[83px] items-start justify-between gap-3 rounded-[12px] bg-[#f9f8f6] px-[21px] pt-[14px] pb-[16px]">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[#8b8b8b]">{field.label}</div>
        {editing ? (
          field.type === 'select' ? (
            <select
              autoFocus
              className="mt-px w-full border-none bg-none p-0 text-base font-medium leading-4 text-black outline-none"
              value={raw}
              onChange={(e) => onDraft(field.key, e.target.value)}
              aria-label={field.label}
            >
              {GENDERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={field.type === 'password' ? 'password' : field.type}
              className="mt-px w-full border-none bg-none p-0 text-base font-medium leading-4 tracking-[-0.24px] text-black outline-none"
              value={raw}
              onChange={(e) => onDraft(field.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave(field.key)
                if (e.key === 'Escape') onCancel()
              }}
              aria-label={field.label}
            />
          )
        ) : field.key === 'password' ? (
          <div className="mt-px flex h-4 items-center gap-[11px]" aria-label={`Password, ${raw.length} characters`}>
            {Array.from({ length: Math.min(Math.max(raw.length, 6), 12) }, (_, i) => (
              <span key={i} className="w-[7px] h-[7px] rounded-full bg-black" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="mt-px truncate text-base font-medium leading-4 tracking-[-0.24px] text-black">
            {value}
          </div>
        )}
        {editing && field.key === 'password' && raw.length > 0 && (
          <div className={`mt-[6px] text-[10px] leading-[13px] ${strength.className}`}>
            密码强度：{strength.label}
          </div>
        )}
        {error && <div className="mt-[6px] text-[10px] leading-[13px] text-[#f50000]">{error}</div>}
      </div>
      {editing ? (
        <div className="flex shrink-0 items-center gap-3 pt-px">
          <button
            className="border-none bg-none p-0 text-xs font-medium text-[#00b861] cursor-pointer"
            type="button"
            onClick={() => onSave(field.key)}
          >
            保存
          </button>
          <button
            className="border-none bg-none p-0 text-xs text-[#b6bbb9] cursor-pointer"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      ) : (
        <button
          className="flex shrink-0 items-center justify-center w-[18px] h-[18px] border-none bg-none p-0 cursor-pointer"
          type="button"
          aria-label={`Edit ${field.label}`}
          onClick={() => onEdit(field.key)}
        >
          <img className="w-[18px] h-[18px]" src={iconEdit} alt="" />
        </button>
      )}
    </div>
  )
}

function MyProfile() {
  const profile = useProfileStore()
  const setField = useProfileStore((s) => s.setField)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({})
  const [error, setError] = useState(null)

  const draftOf = (key) => (editing === key ? (draft[key] ?? '') : profile[key])
  const { done, total, percent } = profileCompleteness(profile)

  function startEdit(key) {
    setDraft({ [key]: String(profile[key] ?? '') })
    setError(null)
    setEditing(key)
  }

  function changeDraft(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
    if (error) setError(null)
  }

  function save(key) {
    const result = validateProfileField(key, draftOf(key))
    if (result.error) {
      setError(result.error)
      return
    }
    setField(key, result.value)
    setEditing(null)
    setError(null)
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="My Profile" />

      <div className="mt-4 px-[30px] space-y-4">
        {profile.loading && !profile.id ? (
          <SkeletonCards count={5} />
        ) : (
          FIELDS.map((field) => (
            <ProfileCard
              key={field.key}
              field={field}
              raw={draftOf(field.key)}
              editing={editing === field.key}
              error={editing === field.key ? error : null}
              onEdit={startEdit}
              onDraft={changeDraft}
              onCancel={() => setEditing(null)}
              onSave={save}
            />
          ))
        )}
        <p className="m-0 text-[10px] leading-[13px] text-[#b6bbb9]">
          {profile.id ? `资料完整度 ${percent}%（${done}/${total} 项已通过校验）` : ' '}
        </p>
      </div>
    </div>
  )
}

export default MyProfile
