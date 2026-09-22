import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ORDER_NEXT_STATUS, ORDER_STATUS_ACTION_LABEL } from '../../constants/adminOrder'
import {
  cancelOrderAsStore,
  fetchOrder,
  formatMoney,
  formatTime,
  setOrderStatus,
  updateOrderRemark,
  updateOrderShipping,
} from '../../api/admin'
import {
  Button,
  EmptyState,
  ErrorText,
  Field,
  Modal,
  OrderStatusPill,
  Panel,
  PaymentStatusPill,
  Spinner,
  Table,
  Td,
  TextArea,
  TextInput,
  Tr,
} from './adminUi'

// 状态进度条与买家侧同一套节点，中台只关心走到哪一步
function StepTrack({ steps = [] }) {
  if (steps.length === 0) return null
  return (
    <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-2">
      {steps.map((step) => (
        <li
          key={step.code}
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs ${
            step.done ? 'bg-[#e6f8ef] text-[#00894a]' : 'bg-[#f1f3f5] text-[#9aa3af]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${step.done ? 'bg-[#00b861]' : 'bg-[#cdd3db]'}`} aria-hidden="true" />
          {step.label}
          {step.done && step.at ? <span className="text-[11px] opacity-80">{formatTime(step.at)}</span> : null}
        </li>
      ))}
    </ol>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#eef0f3] last:border-b-0">
      <span className="text-xs text-[#8b93a1] shrink-0">{label}</span>
      <span className="min-w-0 text-sm text-[#1f2937] text-right break-words">{value || '-'}</span>
    </div>
  )
}

function messageOf(mutation, fallback) {
  return mutation.error instanceof Error ? mutation.error.message : fallback
}

// 配送信息：自配送填骑手，走快递填单号，两者可以共存
// 表单初值来自订单，父级用订单 ID 做 key，切单时重新挂载，输入中的内容不会被刷新冲掉
function ShippingForm({ orderId, order, onSaved }) {
  const [form, setForm] = useState({
    courier_name: order.courier_name || '',
    courier_phone: order.courier_phone || '',
    tracking_no: order.tracking_no || '',
  })
  const save = useMutation({
    mutationFn: () => updateOrderShipping(orderId, form),
    onSuccess: onSaved,
  })
  const pick = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  return (
    <form
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="text-[13px] font-medium text-[#374151] mb-2">配送信息</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Field label="骑手姓名" htmlFor="courier-name" className="mb-0">
          <TextInput id="courier-name" value={form.courier_name} placeholder="自配送时填写" onChange={pick('courier_name')} />
        </Field>
        <Field label="骑手电话" htmlFor="courier-phone" className="mb-0">
          <TextInput id="courier-phone" value={form.courier_phone} placeholder="自配送时填写" onChange={pick('courier_phone')} />
        </Field>
        <Field label="快递单号" htmlFor="tracking-no" className="mb-0">
          <TextInput id="tracking-no" value={form.tracking_no} placeholder="走快递时填写" onChange={pick('tracking_no')} />
        </Field>
      </div>
      {save.isError && (
        <div className="mt-3">
          <ErrorText message={messageOf(save, '配送信息保存失败')} />
        </div>
      )}
      <div className="mt-3">
        <Button size="sm" type="submit" disabled={save.isPending}>
          保存配送信息
        </Button>
      </div>
    </form>
  )
}

function RemarkForm({ orderId, remark, onSaved }) {
  const [value, setValue] = useState(remark || '')
  const save = useMutation({
    mutationFn: () => updateOrderRemark(orderId, value.trim()),
    onSuccess: onSaved,
  })

  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <Field label="中台备注" htmlFor="admin-remark" hint="仅本店可见，最多 200 字，不会覆盖买家备注" className="mb-0">
        <TextArea
          id="admin-remark"
          rows={3}
          maxLength={200}
          value={value}
          placeholder="例：买家要求下午三点前送达"
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      {save.isError && (
        <div className="mt-1">
          <ErrorText message={messageOf(save, '备注保存失败')} />
        </div>
      )}
      <div className="mt-2">
        <Button size="sm" type="submit" disabled={save.isPending}>
          保存备注
        </Button>
      </div>
    </form>
  )
}

function AdminOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => fetchOrder(id),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] })

  const advance = useMutation({
    mutationFn: (status) => setOrderStatus(id, status),
    onSuccess: invalidate,
  })
  const cancel = useMutation({
    mutationFn: () => cancelOrderAsStore(id, reason.trim()),
    onSuccess: () => {
      invalidate()
      setCancelOpen(false)
      setReason('')
    },
  })
  // 备注/配送保存成功后顺手清掉状态推进的报错，否则横幅会一直挂在页头
  const refresh = () => {
    invalidate()
    advance.reset()
  }

  if (isPending) return <Spinner label="订单详情加载中..." />
  if (isError) {
    return (
      <ErrorText
        message={error instanceof Error ? error.message : '订单详情加载失败'}
        onRetry={() => refetch()}
      />
    )
  }
  if (!data) return <EmptyState title="订单不存在" />

  const items = data.items || []
  const nextStatuses = ORDER_NEXT_STATUS[data.status] || []
  const terminal = data.status === 'cancelled' || data.status === 'delivered'
  const actionError = advance.error ? messageOf(advance, '状态更新失败') : ''

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title={`订单 ${data.order_no}`}
        description={`${data.store_name || '本门店'} · 下单于 ${formatTime(data.date)}`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/orders')}>
            返回列表
          </Button>
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <OrderStatusPill status={data.status} />
          <PaymentStatusPill status={data.payment_status} />
          {data.refund_status === 'pending' && (
            <span className="inline-flex items-center px-2 h-[22px] rounded-full text-xs font-medium bg-[#fef6f6] text-[#b42318]">
              待退款
            </span>
          )}
        </div>
        <div className="mt-3">
          <StepTrack steps={data.steps} />
        </div>
        {data.cancel_reason && <p className="mt-3 mb-0 text-xs text-[#b42318]">取消原因：{data.cancel_reason}</p>}
        {actionError && (
          <div className="mt-3">
            <ErrorText message={actionError} />
          </div>
        )}
      </Panel>

      <Panel title="处理操作" description="状态只能按接单 → 备货 → 送达推进，未支付的订单不能开工">
        <div className="flex items-center gap-2 flex-wrap">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === 'delivered' ? 'primary' : 'ghost'}
              disabled={advance.isPending}
              onClick={() => advance.mutate(status)}
            >
              {ORDER_STATUS_ACTION_LABEL[status] || status}
            </Button>
          ))}
          {!terminal && (
            <Button size="sm" variant="danger" disabled={cancel.isPending} onClick={() => setCancelOpen(true)}>
              取消订单
            </Button>
          )}
          {nextStatuses.length === 0 && <span className="text-xs text-[#8b93a1]">该订单已到达终态，无需再处理</span>}
        </div>

        <div className="mt-5 border-t border-[#eef0f3] pt-4">
          <Row label="买家备注" value={data.remark} />
        </div>

        <ShippingForm key={`shipping-${id}`} orderId={id} order={data} onSaved={refresh} />
        <RemarkForm key={`remark-${id}`} orderId={id} remark={data.admin_remark} onSaved={refresh} />
      </Panel>

      <Panel title="买家与配送">
        <Row label="收货人" value={data.receiver || data.member_name} />
        <Row label="联系电话" value={data.receiver_phone || data.member_mobile} />
        <Row label="地址标签" value={data.address_label} />
        <Row label="详细地址" value={data.address_detail} />
        <Row label="预计送达" value={formatTime(data.eta)} />
      </Panel>

      <Panel title="商品明细" description={items.length ? `共 ${items.length} 种商品` : ''}>
        <ul className="m-0 p-0 list-none flex flex-col gap-3 md:hidden">
          {items.map((item) => (
            <li key={item.product_id} className="flex items-center gap-3">
              <img src={item.image_url} alt={item.name} className="w-12 h-12 shrink-0 rounded-md object-cover border border-[#eef0f3]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[#111827] break-words">{item.name}</div>
                <div className="mt-1 text-xs text-[#6b7280]">
                  {formatMoney(item.unit_price, data.currency)} × {item.qty}
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium">{formatMoney(item.line_total, data.currency)}</span>
            </li>
          ))}
        </ul>
        <Table className="hidden md:block" head={['商品', '单价', '数量', '小计']}>
          {items.map((item) => (
            <Tr key={item.product_id}>
              <Td>
                <div className="flex items-center gap-3">
                  <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded object-cover border border-[#eef0f3]" />
                  <span className="text-sm">{item.name}</span>
                </div>
              </Td>
              <Td className="whitespace-nowrap">{formatMoney(item.unit_price, data.currency)}</Td>
              <Td className="tabular-nums">{item.qty}</Td>
              <Td className="whitespace-nowrap">{formatMoney(item.line_total, data.currency)}</Td>
            </Tr>
          ))}
        </Table>
        <div className="mt-4 pt-3 border-t border-[#eef0f3] flex flex-col gap-1.5 items-end">
          <span className="text-xs text-[#8b93a1]">
            商品 {formatMoney(data.subtotal, data.currency)} · 优惠 {formatMoney(data.discount, data.currency)} · 配送 {formatMoney(data.delivery_fee, data.currency)}
          </span>
          <span className="text-lg font-semibold text-[#111827]">实收 {formatMoney(data.total, data.currency)}</span>
        </div>
      </Panel>

      <Panel title="支付流水" description="来自 payments 集合，同一单可能有多次支付尝试">
        {(data.payments || []).length === 0 ? (
          <EmptyState title="暂无支付单" description="买家尚未发起支付" />
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {data.payments.map((pay) => (
              <li key={pay.id} className="rounded-md border border-[#eef0f3] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[#111827]">{pay.provider}</span>
                  <span className="text-sm">{formatMoney(pay.amount, pay.currency)}</span>
                </div>
                <div className="mt-1 text-xs text-[#8b93a1]">
                  {pay.status} · 发起 {formatTime(pay.created_at)}
                  {pay.paid_at ? ` · 支付成功 ${formatTime(pay.paid_at)}` : ''}
                </div>
                {pay.trade_no && <div className="mt-1 text-[11px] text-[#aab2bd] break-all">交易号 {pay.trade_no}</div>}
                {pay.fail_reason && <div className="mt-1 text-[11px] text-[#b42318]">{pay.fail_reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="处理留痕" description="记录本门店对这单做过的每一步">
        {(data.admin_logs || []).length === 0 ? (
          <EmptyState title="暂无操作记录" />
        ) : (
          <ol className="m-0 p-0 list-none flex flex-col gap-3">
            {data.admin_logs.map((log, index) => (
              <li key={`${log.at}-${index}`} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00b861]" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm text-[#1f2937] break-words">{log.note || log.action}</div>
                  <div className="mt-0.5 text-[11px] text-[#8b93a1]">
                    {formatTime(log.at)} · {log.operator}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {cancelOpen && (
        <Modal
          title="取消订单"
          onClose={() => setCancelOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                先不取消
              </Button>
              <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                确认取消
              </Button>
            </>
          }
        >
          <p className="mt-0 text-sm text-[#6b7280]">
            取消后会回补库存与优惠券{data.payment_status === 'paid' ? '；本单已收款，本期没有线上退款能力，需线下退款' : ''}。
          </p>
          <Field label="取消原因" htmlFor="cancel-reason" hint="会写入留痕，最多 100 字">
            <TextArea
              id="cancel-reason"
              rows={3}
              maxLength={100}
              value={reason}
              placeholder="例：商品临时缺货，已电话联系买家"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {cancel.isError && <ErrorText message={messageOf(cancel, '取消失败')} />}
        </Modal>
      )}
    </div>
  )
}

export default AdminOrderDetail
