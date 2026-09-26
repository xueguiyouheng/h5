import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import useRequest from '../../hooks/useRequest'
import { createAddress, deleteAddress, fetchAddresses, setDefaultAddress, updateAddress } from '../../api'
import { NeedsPhoneAuth, gotoLogin } from '../../utils/request'
import { writePickedAddress } from './pick'
import './index.scss'

const NEW = 'new'

// 校验口径与服务端 ValidateAddress 一致：详细地址必须用逗号分隔街道与城市，
// 否则列表里没法折行，下单快照里的收货信息也会糊成一行
function validate(label, detail) {
  const name = String(label).trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 16) return { error: '名称需 2-16 个字符' }
  const text = String(detail).trim().replace(/\s+/g, ' ')
  if (text.length < 12) return { error: '地址至少 12 个字符' }
  if (!text.includes(',')) return { error: '地址需用逗号分隔街道与城市' }
  return { value: { label: name, detail: text } }
}

function linesOf(detail) {
  const parts = String(detail || '')
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return [parts[0] || '']
  return [parts[0], parts.slice(1).join(', ')]
}

function AddressForm({ draft, asDefault, tip, busy, showDelete, onDraft, onDefault, onSave, onCancel, onDelete }) {
  return (
    <View className="form">
      <Input
        className="form__label"
        placeholder="地址名称，如 家"
        value={draft.label}
        onInput={(e) => onDraft('label', e.detail.value)}
      />
      <Textarea
        className="form__detail"
        placeholder="街道, 城市, 邮编"
        value={draft.detail}
        onInput={(e) => onDraft('detail', e.detail.value)}
      />
      <View className="form__default" onClick={onDefault}>
        <View className={`check ${asDefault ? 'check--on' : ''}`} />
        <Text className="form__hint">设为默认地址</Text>
      </View>
      {tip ? <Text className="form__error">{tip}</Text> : null}
      <View className="form__actions">
        <Text className={`btn form__save ${busy ? 'btn--dim' : ''}`} onClick={onSave}>
          保存
        </Text>
        <Text className="form__cancel" onClick={onCancel}>
          取消
        </Text>
        {showDelete ? (
          <Text className="form__delete" onClick={onDelete}>
            删除
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * 收货地址：增删改与默认地址全部落服务端
 * 从结算页进来（?pick=1）时点一条即写回选择并返回，不打断结算流程
 */
export default function Address() {
  const router = useRouter()
  const picking = router.params.pick === '1'
  const { data, loading, error, refresh } = useRequest(fetchAddresses)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ label: '', detail: '' })
  const [asDefault, setAsDefault] = useState(false)
  const [tip, setTip] = useState('')
  const [busy, setBusy] = useState(false)

  const list = (data && data.list) || []
  const defaultId = (data && data.defaultId) || ''

  function startAdd() {
    setDraft({ label: '', detail: '' })
    setAsDefault(list.length === 0)
    setTip('')
    setEditing(NEW)
  }

  function startEdit(item) {
    setDraft({ label: item.label, detail: item.detail })
    setAsDefault(item.id === defaultId)
    setTip('')
    setEditing(item.id)
  }

  async function run(fn) {
    if (busy) return
    setBusy(true)
    setTip('')
    try {
      await fn()
      setEditing(null)
      await refresh()
    } catch (err) {
      setTip((err && err.message) || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const checked = validate(draft.label, draft.detail)
    if (checked.error) {
      setTip(checked.error)
      return
    }
    if (list.some((item) => item.id !== editing && item.label.toLowerCase() === checked.value.label.toLowerCase())) {
      setTip('该名称已存在')
      return
    }
    if (editing === NEW) {
      run(() => createAddress({ ...checked.value, asDefault }))
      return
    }
    run(async () => {
      await updateAddress(editing, checked.value)
      // 编辑时才改默认：非默认项勾上即切换，取消勾选交给服务端按「至少一条默认」处理
      if (asDefault && editing !== defaultId) await setDefaultAddress(editing)
    })
  }

  async function remove(id) {
    const confirmed = await Taro.showModal({ title: '删除地址', content: '删除后不可恢复，默认地址会自动落到第一条' })
    if (!confirmed.confirm) return
    run(() => deleteAddress(id))
  }

  if (error instanceof NeedsPhoneAuth) {
    return (
      <View className="page">
        <Text className="tip">先登录，才能管理你的收货地址</Text>
        <Text className="tip__action" onClick={gotoLogin}>
          去登录
        </Text>
      </View>
    )
  }

  if (loading && !data) {
    return (
      <View className="page">
        <View className="sk sk--addr" />
        <View className="sk sk--addr" />
      </View>
    )
  }

  // 地址已经在屏上就不整页报错：刷新失败留着旧列表继续改，重进本页即重试
  if (error && !list.length) {
    return (
      <View className="page">
        <Text className="tip">{error.message}</Text>
        <Text className="tip__action" onClick={refresh}>
          重新加载
        </Text>
      </View>
    )
  }

  return (
    <View className="addr-page">
      {picking ? <Text className="addr-page__hint">点一条地址用于本次结算</Text> : null}

      {list.map((item) =>
        editing === item.id ? (
          <AddressForm
            key={item.id}
            draft={draft}
            asDefault={asDefault}
            tip={tip}
            busy={busy}
            showDelete
            onDraft={(key, value) => setDraft({ ...draft, [key]: value })}
            onDefault={() => setAsDefault(!asDefault)}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={() => remove(item.id)}
          />
        ) : (
          <View
            className={`card ${picking ? 'card--pick' : ''}`}
            key={item.id}
            onClick={() => {
              if (!picking) return
              writePickedAddress(item.id)
              Taro.navigateBack()
            }}
          >
            <View className="card__head">
              <Text className="card__label">
                {item.label}
                {item.id === defaultId ? <Text className="card__badge">默认</Text> : null}
              </Text>
              <View className="card__ops">
                {item.id !== defaultId ? (
                  <Text
                    className="card__op"
                    onClick={(e) => {
                      e.stopPropagation()
                      run(() => setDefaultAddress(item.id))
                    }}
                  >
                    设为默认
                  </Text>
                ) : null}
                <Text
                  className="card__op"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEdit(item)
                  }}
                >
                  编辑
                </Text>
              </View>
            </View>
            {linesOf(item.detail).map((line) => (
              <Text className="card__line" key={line}>
                {line}
              </Text>
            ))}
          </View>
        ),
      )}

      {editing === NEW ? (
        <AddressForm
          draft={draft}
          asDefault={asDefault}
          tip={tip}
          busy={busy}
          onDraft={(key, value) => setDraft({ ...draft, [key]: value })}
          onDefault={() => setAsDefault(!asDefault)}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {editing === null ? (
        <Text className={`btn ${list.length ? 'btn--ghost' : ''} addr-page__add`} onClick={startAdd}>
          {list.length ? '新增地址' : '还没有收货地址，先添加一条'}
        </Text>
      ) : null}

      {list.length ? <Text className="addr-page__foot">共 {list.length} 个地址 · 结算时使用带「默认」标记的那条</Text> : null}
    </View>
  )
}
