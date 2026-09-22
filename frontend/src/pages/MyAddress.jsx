import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { SkeletonCards } from '../components/Skeleton'
import iconEdit from '../assets/my-profile/icon-edit.svg'
import { formatAddressLines, useAddressStore, validateAddressField } from '../stores/addressStore'

const NEW = 'new'

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M0.5 5.5h10M5.5 0.5v10" stroke="#8b8b8b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AddressCard({ address, isDefault, onEdit, onSetDefault }) {
  const lines = formatAddressLines(address.detail)

  return (
    <div className="min-h-[83px] rounded-[12px] bg-[#f9f8f6] px-[21px] pt-[14px] pb-[16px]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-[6px] text-xs font-medium leading-[19px] text-black">
          <span className="truncate">{address.label}</span>
          {isDefault && (
            <span className="shrink-0 rounded-full bg-[#00b861]/10 px-[6px] text-[8px] leading-[14px] text-[#00b861]">
              默认
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-[10px]">
          {!isDefault && (
            <button
              className="border-none bg-none p-0 text-[10px] leading-[18px] text-[#00b861] cursor-pointer"
              type="button"
              onClick={onSetDefault}
            >
              设为默认
            </button>
          )}
          <button
            className="flex h-[18px] w-[18px] items-center justify-center border-none bg-none p-0 cursor-pointer"
            type="button"
            aria-label={`编辑 ${address.label}`}
            onClick={onEdit}
          >
            <img src={iconEdit} alt="" width="18" height="18" />
          </button>
        </span>
      </div>
      <p className="mt-[2px] text-[10px] leading-4 tracking-[-0.24px] whitespace-pre-line text-[#8b8b8b]">
        {lines.join('\n')}
      </p>
    </div>
  )
}

function AddressForm({ editing, draft, error, defaultChecked, onDraft, onDefaultChange, onSave, onCancel, onDelete }) {
  return (
    <div className="rounded-[12px] bg-[#f9f8f6] px-[21px] pt-[14px] pb-[16px]">
      <input
        autoFocus
        className="w-full border-none bg-none p-0 text-xs font-medium leading-[19px] text-black outline-none placeholder:text-[#b6bbb9]"
        type="text"
        placeholder="地址名称，如 My Home"
        aria-label="地址名称"
        value={draft.label}
        onChange={(e) => onDraft('label', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <textarea
        className="mt-[6px] w-full resize-none border-none bg-none p-0 text-[10px] leading-4 tracking-[-0.24px] text-[#8b8b8b] outline-none placeholder:text-[#b6bbb9]"
        rows="2"
        placeholder="街道, 城市, 邮编, 国家"
        aria-label="详细地址"
        value={draft.detail}
        onChange={(e) => onDraft('detail', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      />
      {error && <p className="m-0 mt-[6px] text-[10px] leading-[13px] text-[#f50000]">{error}</p>}
      <label className="mt-[6px] flex items-center gap-[6px] text-[10px] leading-[18px] text-[#8b8b8b] cursor-pointer">
        <input
          className="m-0 w-[13px] h-[13px] accent-[#00b861]"
          type="checkbox"
          checked={defaultChecked}
          onChange={(e) => onDefaultChange(e.target.checked)}
        />
        设为默认地址
      </label>
      <div className="mt-[10px] flex items-center gap-[10px]">
        <button
          className="h-[28px] px-[16px] rounded-full bg-[#00b861] border-none text-xs font-medium text-white cursor-pointer hover:brightness-110 active:brightness-90"
          type="button"
          onClick={onSave}
        >
          保存
        </button>
        <button
          className="h-[28px] px-[16px] rounded-full bg-white border border-[#e4e4e4] text-xs font-medium text-[#8b8b8b] cursor-pointer"
          type="button"
          onClick={onCancel}
        >
          取消
        </button>
        {editing !== NEW && (
          <button
            className="ml-auto h-[28px] px-[10px] border-none bg-none text-xs font-medium text-[#f50000] cursor-pointer"
            type="button"
            onClick={onDelete}
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}

function MyAddress() {
  const list = useAddressStore((s) => s.list)
  const loading = useAddressStore((s) => s.loading)
  const defaultId = useAddressStore((s) => s.defaultId)
  const addAddress = useAddressStore((s) => s.addAddress)
  const updateAddress = useAddressStore((s) => s.updateAddress)
  const removeAddress = useAddressStore((s) => s.removeAddress)
  const setDefault = useAddressStore((s) => s.setDefault)

  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ label: '', detail: '' })
  const [makeDefault, setMakeDefault] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setEditing(null)
    setError(null)
  }

  function startAdd() {
    setDraft({ label: '', detail: '' })
    setMakeDefault(list.length === 0)
    setError(null)
    setEditing(NEW)
  }

  function startEdit(address) {
    setDraft({ label: address.label, detail: address.detail })
    setMakeDefault(address.id === defaultId)
    setError(null)
    setEditing(address.id)
  }

  function changeDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  function save() {
    const label = validateAddressField('label', draft.label)
    if (label.error) return setError(label.error)
    const detail = validateAddressField('detail', draft.detail)
    if (detail.error) return setError(detail.error)
    if (list.some((item) => item.id !== editing && item.label.toLowerCase() === label.value.toLowerCase())) {
      return setError('该名称已存在')
    }

    if (editing === NEW) {
      addAddress({ label: label.value, detail: detail.value }, { asDefault: makeDefault })
    } else {
      updateAddress(editing, { label: label.value, detail: detail.value })
      if (makeDefault) setDefault(editing)
    }
    close()
  }

  function remove() {
    removeAddress(editing)
    close()
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader
        title="My Address"
        right={
          <button
            className="flex h-6 items-center gap-[5px] border-none bg-none p-0 cursor-pointer"
            type="button"
            onClick={startAdd}
          >
            <PlusIcon />
            <span className="text-[13px] font-medium text-[#8b8b8b]">Add</span>
          </button>
        }
      />

      <div className="mt-4 px-[30px] space-y-4">
        {loading && list.length === 0 && <SkeletonCards count={3} />}
        {!loading && list.length === 0 && editing === null && (
          <p className="m-0 py-[40px] text-sm text-center text-[#b6bbb9]">还没有收货地址，点右上角 Add 新增</p>
        )}
        {list.map((address) =>
          editing === address.id ? (
            <AddressForm
              key={address.id}
              editing={editing}
              draft={draft}
              error={error}
              defaultChecked={makeDefault}
              onDraft={changeDraft}
              onDefaultChange={setMakeDefault}
              onSave={save}
              onCancel={close}
              onDelete={remove}
            />
          ) : (
            <AddressCard
              key={address.id}
              address={address}
              isDefault={address.id === defaultId}
              onEdit={() => startEdit(address)}
              onSetDefault={() => setDefault(address.id)}
            />
          )
        )}
        {editing === NEW && (
          <AddressForm
            editing={NEW}
            draft={draft}
            error={error}
            defaultChecked={makeDefault}
            onDraft={changeDraft}
            onDefaultChange={setMakeDefault}
            onSave={save}
            onCancel={close}
            onDelete={remove}
          />
        )}
        <p className="m-0 text-[10px] leading-[13px] text-[#b6bbb9]">
          {loading && list.length === 0 ? ' ' : `共 ${list.length} 个地址 · 结算时使用默认地址`}
        </p>
      </div>
    </div>
  )
}

export default MyAddress
