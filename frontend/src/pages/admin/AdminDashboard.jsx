import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchStats } from '../../api/admin'
import { Card, EmptyState, ErrorText, Panel, Spinner } from './adminUi'

const CARDS = [
  { key: 'product_count', label: '商品总数', hint: '全部运营商品' },
  { key: 'category_count', label: '类目数量', hint: '含子分类的顶层类目' },
  { key: 'carousel_count', label: '轮播条目', hint: '首页轮播配置' },
  { key: 'ongoing_order_count', label: '进行中订单', hint: '待处理订单' },
]

const QUICK_LINKS = [
  { to: '/admin/orders', label: '订单处理', desc: '备货、配送与退款留痕' },
  { to: '/admin/products/new', label: '新建商品', desc: '填写资料并发布到首页版块' },
  { to: '/admin/carousel', label: '配置轮播', desc: '调整首页 Banner 与排序' },
  { to: '/admin/categories', label: '管理类目', desc: '维护类目与子分类' },
  { to: '/admin/media', label: '素材库', desc: '查看已上传图片' },
  { to: '/admin/store', label: '门店资料', desc: '名称、坐标与配送范围' },
]

function formatCount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString('zh-CN') : '-'
}

function AdminDashboard() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchStats,
  })

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="数据概览"
        description={isFetching ? '正在刷新…' : '来自 /admin/stats 的实时统计'}
        actions={
          <button
            type="button"
            className="h-8 px-3 rounded-md border border-[#d6dbe1] bg-white text-[13px] text-[#374151] cursor-pointer hover:bg-[#f7f8fa] disabled:opacity-50"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            刷新
          </button>
        }
      >
        {isPending && <Spinner label="统计数据加载中..." className="py-8 justify-center" />}
        {isError && (
          <ErrorText message={error instanceof Error ? error.message : '统计数据加载失败'} onRetry={() => refetch()} />
        )}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {CARDS.map((card) => (
              <Card key={card.key}>
                <div className="text-xs text-[#8b93a1]">{card.label}</div>
                <div className="mt-2 text-[26px] leading-8 font-semibold text-[#111827]">
                  {formatCount(data[card.key])}
                </div>
                <div className="mt-1 text-[11px] text-[#aab2bd]">{card.hint}</div>
              </Card>
            ))}
          </div>
        )}
        {data && CARDS.every((card) => !Number.isFinite(Number(data[card.key]))) && (
          <EmptyState title="统计数据为空" description="后端未返回计数字段" />
        )}
      </Panel>

      <Panel title="快捷入口" description="常用运营动作">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="block rounded-lg border border-[#e6e9ee] bg-white p-4 no-underline hover:no-underline hover:border-[#00b861] hover:bg-[#f6fdf9]"
            >
              <div className="text-sm font-medium text-[#111827]">{link.label}</div>
              <div className="mt-1.5 text-xs text-[#8b93a1]">{link.desc}</div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export default AdminDashboard
