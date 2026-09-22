import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchStoreProfile, formatTime, saveStoreProfile } from '../../api/admin'
import { Button, ErrorText, Field, Panel, Select, Spinner, TextArea, TextInput } from './adminUi'

// 空字段表示不修改，与后端 UpdateStore 的语义一致，所以初值直接灌当前资料
function toForm(store) {
  return {
    name: store.name || '',
    logo_url: store.logo_url || '',
    phone: store.phone || '',
    address: store.address || '',
    description: store.description || '',
    notice: store.notice || '',
    longitude: String(store.longitude ?? ''),
    latitude: String(store.latitude ?? ''),
    delivery_radius_km: String(store.delivery_radius_km ?? ''),
    min_order_amount: store.min_order_amount || '',
    status: store.status || 'open',
  }
}

function AdminStore() {
  const { data: store, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'store'],
    queryFn: fetchStoreProfile,
  })
  const [form, setForm] = useState(null)

  const save = useMutation({
    mutationFn: (payload) => saveStoreProfile(payload),
    onSuccess: (next) => setForm(toForm(next)),
  })

  const pick = (key) => (event) => setForm((prev) => ({ ...(prev || toForm(store)), [key]: event.target.value }))

  if (isPending) return <Spinner label="门店资料加载中..." />
  if (isError) {
    return <ErrorText message={error instanceof Error ? error.message : '门店资料加载失败'} onRetry={() => refetch()} />
  }

  const current = form || toForm(store)

  const submit = (event) => {
    event.preventDefault()
    save.mutate({
      ...current,
      longitude: Number(current.longitude) || 0,
      latitude: Number(current.latitude) || 0,
      delivery_radius_km: Number(current.delivery_radius_km) || 0,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="门店资料"
        description={`门店 ID ${store.id} · 创建于 ${formatTime(store.created_at)}`}
        actions={
          <span
            className={`inline-flex items-center px-2 h-[22px] rounded-full text-xs font-medium ${
              store.status === 'open' ? 'bg-[#e6f8ef] text-[#00894a]' : 'bg-[#f1f3f5] text-[#6b7280]'
            }`}
          >
            {store.status === 'open' ? '营业中' : '休息中'}
          </span>
        }
      >
        <p className="m-0 text-xs text-[#8b93a1]">
          买家在「附近门店」列表与首页切店面板里看到的就是这些信息；休息中的门店买家侧不可选。
        </p>
      </Panel>

      <Panel title="基本信息">
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="门店名称" htmlFor="store-name" required className="mb-0">
              <TextInput id="store-name" value={current.name} maxLength={40} onChange={pick('name')} />
            </Field>
            <Field label="联系电话" htmlFor="store-phone" className="mb-0">
              <TextInput id="store-phone" value={current.phone} maxLength={20} onChange={pick('phone')} />
            </Field>
            <Field label="门店地址" htmlFor="store-address" className="mb-0 sm:col-span-2">
              <TextInput id="store-address" value={current.address} maxLength={120} onChange={pick('address')} />
            </Field>
            <Field label="门店简介" htmlFor="store-description" className="mb-0 sm:col-span-2">
              <TextArea id="store-description" rows={2} value={current.description} maxLength={100} onChange={pick('description')} />
            </Field>
            <Field label="门店公告" htmlFor="store-notice" className="mb-0 sm:col-span-2">
              <TextArea id="store-notice" rows={2} value={current.notice} maxLength={100} onChange={pick('notice')} />
            </Field>
            <Field label="Logo 图片地址" htmlFor="store-logo" className="mb-0 sm:col-span-2">
              <TextInput id="store-logo" value={current.logo_url} placeholder="从素材库复制图片 URL" onChange={pick('logo_url')} />
            </Field>
          </div>

          <div className="mt-5 pt-4 border-t border-[#eef0f3] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="经度" htmlFor="store-lng" hint="买家定位与门店的直线距离用它算" className="mb-0">
              <TextInput id="store-lng" type="number" step="0.000001" value={current.longitude} onChange={pick('longitude')} />
            </Field>
            <Field label="纬度" htmlFor="store-lat" className="mb-0">
              <TextInput id="store-lat" type="number" step="0.000001" value={current.latitude} onChange={pick('latitude')} />
            </Field>
            <Field label="配送半径（公里）" htmlFor="store-radius" hint="超出半径的买家不可下单" className="mb-0">
              <TextInput id="store-radius" type="number" min="1" value={current.delivery_radius_km} onChange={pick('delivery_radius_km')} />
            </Field>
            <Field label="起送金额" htmlFor="store-min" className="mb-0">
              <TextInput id="store-min" value={current.min_order_amount} placeholder="例：20.00" onChange={pick('min_order_amount')} />
            </Field>
            <Field label="营业状态" htmlFor="store-status" className="mb-0">
              <Select id="store-status" value={current.status} onChange={pick('status')}>
                <option value="open">营业中</option>
                <option value="closed">休息中</option>
              </Select>
            </Field>
          </div>

          {save.isError && (
            <div className="mt-4">
              <ErrorText message={save.error instanceof Error ? save.error.message : '门店资料保存失败'} />
            </div>
          )}
          {save.isSuccess && (
            <div className="mt-4">
              <span className="text-xs text-[#00894a]" role="status">
                已保存
              </span>
            </div>
          )}

          <div className="mt-5">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? '保存中...' : '保存门店资料'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

export default AdminStore
