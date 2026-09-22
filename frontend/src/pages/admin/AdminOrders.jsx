import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchOrderSummary, fetchOrders, formatMoney, formatTime } from '../../api/admin'
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  OrderStatusPill,
  PaginationBar,
  Panel,
  PaymentStatusPill,
  Select,
  Spinner,
  Table,
  Td,
  TextInput,
  Tr,
} from './adminUi'

const PAGE_SIZE = 10

// 状态页签，值与后端 status 参数一致
const TABS = [
  { value: '', label: '全部' },
  { value: 'accepted', label: '待备货' },
  { value: 'ready', label: '待配送' },
  { value: 'delivered', label: '已送达' },
  { value: 'cancelled', label: '已取消' },
]

// 看板把要动手的单排在前面，已付款金额单独占一格拉 cash
const SUMMARY_CARDS = [
  { key: 'accepted', label: '待备货' },
  { key: 'ready', label: '待配送' },
  { key: 'unpaid', label: '待付款' },
  { key: 'today_new', label: '今日新单' },
]

function itemCount(order) {
  return (order.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
}

function orderTitle(order) {
  const first = (order.items || [])[0]
  if (!first) return '（无商品）'
  return order.items.length > 1 ? `${first.name} 等 ${order.items.length} 种` : first.name
}

function AdminOrders() {
  const navigate = useNavigate()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data: summary } = useQuery({
    queryKey: ['admin', 'order-summary'],
    queryFn: fetchOrderSummary,
  })
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['admin', 'orders', page, keyword, status, paymentStatus],
    queryFn: () => fetchOrders({ page, pageSize: PAGE_SIZE, keyword, status, paymentStatus }),
    placeholderData: keepPreviousData,
  })

  const list = data?.list ?? []

  const applyFilters = (event) => {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const resetFilters = () => {
    setKeywordInput('')
    setKeyword('')
    setStatus('')
    setPaymentStatus('')
    setPage(1)
  }

  const pickTab = (value) => {
    setPage(1)
    setStatus(value)
  }

  return (
    <div className="flex flex-col gap-5">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
          {SUMMARY_CARDS.map((card) => (
            <Card key={card.key} className="p-3.5 md:p-4">
              <div className="text-xs text-[#8b93a1]">{card.label}</div>
              <div className="mt-1.5 text-[22px] leading-7 font-semibold text-[#111827] md:text-[26px] md:leading-8">
                {Number(summary[card.key]) || 0}
              </div>
            </Card>
          ))}
          <Card className="p-3.5 md:p-4">
            <div className="text-xs text-[#8b93a1]">今日收款</div>
            <div className="mt-1.5 text-[22px] leading-7 font-semibold text-[#00894a] md:text-[26px] md:leading-8">
              {formatMoney(summary.today_paid_amount, summary.currency)}
            </div>
          </Card>
        </div>
      )}

      <Panel title="订单处理" description="按状态检索本门店订单，点击行进入处理详情">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {TABS.map((tab) => (
            <Button
              key={tab.value || 'all'}
              size="sm"
              variant={status === tab.value ? 'primary' : 'ghost'}
              onClick={() => pickTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <form onSubmit={applyFilters} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="关键词" htmlFor="order-keyword" className="mb-0">
              <TextInput
                id="order-keyword"
                value={keywordInput}
                placeholder="单号 / 收货人 / 手机号"
                onChange={(event) => setKeywordInput(event.target.value)}
              />
            </Field>
            <Field label="支付状态" htmlFor="order-payment" className="mb-0">
              <Select
                id="order-payment"
                value={paymentStatus}
                onChange={(event) => {
                  setPage(1)
                  setPaymentStatus(event.target.value)
                }}
              >
                <option value="">全部</option>
                <option value="unpaid">待付款</option>
                <option value="paid">已付款</option>
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={isFetching}>
                查询
              </Button>
              <Button type="button" variant="ghost" onClick={resetFilters}>
                重置
              </Button>
            </div>
          </div>
        </form>

        <div className={`mt-4 ${isPlaceholderData ? 'opacity-50' : ''}`}>
          {isPending && <Spinner label="订单加载中..." />}
          {isError && <ErrorText message={error instanceof Error ? error.message : '订单加载失败'} onRetry={() => refetch()} />}
          {data && list.length === 0 && (
            <EmptyState title="没有符合条件的订单" description="换个状态页签或清空筛选条件再试" />
          )}
          {data && list.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-3 md:hidden">
              {list.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-md border border-[#e6e9ee] bg-white p-3 cursor-pointer hover:border-[#00b861]"
                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-sm font-medium text-[#111827] truncate">{order.order_no}</span>
                      <OrderStatusPill status={order.status} />
                    </div>
                    <div className="mt-1.5 text-xs text-[#6b7280] truncate">
                      {orderTitle(order)} · {order.receiver || order.member_name || '-'}
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <span className="text-sm font-medium">{formatMoney(order.total, order.currency)}</span>
                      <span className="text-[11px] text-[#8b93a1]">{formatTime(order.date)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && list.length > 0 && (
            <Table className="hidden md:block" head={['单号', '商品', '买家', '金额', '支付', '状态', '下单时间', '操作']}>
              {list.map((order) => (
                <Tr key={order.id}>
                  <Td className="whitespace-nowrap font-medium">{order.order_no}</Td>
                  <Td>
                    <div className="text-sm">{orderTitle(order)}</div>
                    <div className="mt-1 text-xs text-[#8b93a1]">{itemCount(order)} 件</div>
                  </Td>
                  <Td>
                    <div className="text-sm">{order.receiver || order.member_name || '-'}</div>
                    <div className="mt-1 text-xs text-[#8b93a1]">{order.receiver_phone || order.member_mobile || '-'}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{formatMoney(order.total, order.currency)}</Td>
                  <Td>
                    <PaymentStatusPill status={order.payment_status} />
                    {order.refund_status === 'pending' && (
                      <div className="mt-1 text-[11px] text-[#b42318]">待退款</div>
                    )}
                  </Td>
                  <Td>
                    <OrderStatusPill status={order.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-[#6b7280]">{formatTime(order.date)}</Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/orders/${order.id}`)}>
                      处理
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>

        {data && list.length > 0 && (
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        )}
      </Panel>
    </div>
  )
}

export default AdminOrders
