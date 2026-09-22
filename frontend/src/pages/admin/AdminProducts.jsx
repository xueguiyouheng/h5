import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteProduct,
  fetchCategories,
  fetchProducts,
  formatMoney,
  updateProductStatus,
} from '../../api/admin'
import {
  Button,
  EmptyState,
  ErrorText,
  Field,
  Panel,
  PaginationBar,
  Select,
  Spinner,
  StatusPill,
  Table,
  Td,
  TextInput,
  Tr,
} from './adminUi'

const PAGE_SIZE = 20
const CATEGORY_PAGE_SIZE = 100

function SectionTags({ sections }) {
  if (!sections || sections.length === 0) return <span className="text-xs text-[#aab2bd]">未投放</span>
  return (
    <div className="flex flex-wrap gap-1">
      {sections.map((section) => (
        <span key={section} className="px-1.5 h-5 inline-flex items-center rounded bg-[#eef4ff] text-[11px] text-[#3563e9]">
          {section}
        </span>
      ))}
    </div>
  )
}

function AdminProducts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const filters = { page, pageSize: PAGE_SIZE, keyword, categoryId, status }
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products', page, keyword, categoryId, status],
    queryFn: () => fetchProducts(filters),
  })
  const { data: categoryData } = useQuery({
    queryKey: ['admin', 'categories', 1, CATEGORY_PAGE_SIZE],
    queryFn: () => fetchCategories({ page: 1, pageSize: CATEGORY_PAGE_SIZE }),
  })

  const categories = categoryData?.list ?? []
  const categoryName = (id) => categories.find((item) => String(item.id) === String(id))?.name || `#${id || '-'}`
  const list = data?.list ?? []

  const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })

  const toggleStatus = useMutation({
    mutationFn: ({ id, next }) => updateProductStatus(id, next),
    onSuccess: () => {
      invalidateProducts()
      queryClient.invalidateQueries({ queryKey: ['admin', 'product'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id) => deleteProduct(id),
    onSuccess: () => {
      invalidateProducts()
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
  })

  const applyFilters = (event) => {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const resetFilters = () => {
    setKeywordInput('')
    setKeyword('')
    setCategoryId('')
    setStatus('')
    setPage(1)
  }

  const handleDelete = (product) => {
    if (window.confirm(`确定删除商品「${product.name}」吗？`)) remove.mutate(product.id)
  }

  const loaded = Math.min(list.length + (data ? (data.page - 1) * data.page_size : 0), Number(data?.total ?? 0))
  const hasMore = data ? loaded < Number(data.total) : false

  return (
    <div className="flex flex-col gap-5">
      <Panel title="筛选" description="按关键词、类目与上架状态检索商品">
        <form onSubmit={applyFilters} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="关键词" htmlFor="product-keyword">
              <TextInput
                id="product-keyword"
                value={keywordInput}
                placeholder="商品名称"
                onChange={(event) => setKeywordInput(event.target.value)}
              />
            </Field>
            <Field label="类目" htmlFor="product-category">
              <Select
                id="product-category"
                value={categoryId}
                onChange={(event) => {
                  setPage(1)
                  setCategoryId(event.target.value)
                }}
              >
                <option value="">全部类目</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="状态" htmlFor="product-status">
              <Select
                id="product-status"
                value={status}
                onChange={(event) => {
                  setPage(1)
                  setStatus(event.target.value)
                }}
              >
                <option value="">全部状态</option>
                <option value="on">已上架</option>
                <option value="off">已下架</option>
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
      </Panel>

      <Panel
        title="商品管理"
        description={data ? `共 ${data.total} 个商品 · 第 ${data.page} 页` : '发品与上下架维护'}
        actions={
          <Button size="sm" onClick={() => navigate('/admin/products/new')}>
            新建商品
          </Button>
        }
      >
        {toggleStatus.isError && (
          <ErrorText message={toggleStatus.error instanceof Error ? toggleStatus.error.message : '状态更新失败'} />
        )}
        {remove.isError && <ErrorText message={remove.error instanceof Error ? remove.error.message : '删除失败'} />}
        {isPending && <Spinner label="商品加载中..." />}
        {isError && <ErrorText message={error instanceof Error ? error.message : '商品加载失败'} onRetry={() => refetch()} />}
        {data && list.length === 0 && (
          <EmptyState title="没有符合条件的商品" description="调整筛选条件，或点击右上角「新建商品」发品" />
        )}
        {data && list.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-col gap-3 md:hidden">
            {list.map((product) => (
              <li key={product.id} className="rounded-md border border-[#e6e9ee] p-3">
                <div className="flex items-start gap-3">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-14 h-14 shrink-0 rounded-md object-cover border border-[#eef0f3]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#111827] break-words">{product.name}</div>
                    <div className="mt-1 text-xs text-[#6b7280]">
                      {categoryName(product.category_id)} · 库存 {product.stock} · 销量 {product.sales}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {product.badge && (
                      <span className="px-1.5 h-5 inline-flex items-center rounded bg-[#fff4e5] text-[11px] text-[#b54708]">
                        {product.badge}
                      </span>
                    )}
                    <StatusPill status={product.status} />
                  </div>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm">{formatMoney(product.price, product.currency, product.unit)}</div>
                    {product.old_price && (
                      <div className="mt-0.5 text-xs text-[#aab2bd] line-through">
                        {formatMoney(product.old_price, product.currency, '')}
                      </div>
                    )}
                  </div>
                  <SectionTags sections={product.sections} />
                </div>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={toggleStatus.isPending}
                    onClick={() =>
                      toggleStatus.mutate({ id: product.id, next: product.status === 'on' ? 'off' : 'on' })
                    }
                  >
                    {product.status === 'on' ? '下架' : '上架'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/products/${product.id}/edit`)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => handleDelete(product)}>
                    删除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && list.length > 0 && (
          <Table className="hidden md:block" head={['主图', '商品', '价格', '类目', '库存', '销量', '状态', '操作']}>
            {list.map((product) => (
              <Tr key={product.id}>
                <Td className="w-[76px]">
                  <img src={product.image_url} alt={product.name} className="w-[60px] h-[60px] object-cover rounded" />
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{product.name}</span>
                    {product.badge && (
                      <span className="px-1.5 h-5 inline-flex items-center rounded bg-[#fff4e5] text-[11px] text-[#b54708]">
                        {product.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <SectionTags sections={product.sections} />
                  </div>
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="text-sm">{formatMoney(product.price, product.currency, product.unit)}</div>
                  {product.old_price && (
                    <div className="mt-0.5 text-xs text-[#aab2bd] line-through">
                      {formatMoney(product.old_price, product.currency, '')}
                    </div>
                  )}
                </Td>
                <Td className="text-xs text-[#6b7280] whitespace-nowrap">{categoryName(product.category_id)}</Td>
                <Td className="tabular-nums">{product.stock}</Td>
                <Td className="tabular-nums">{product.sales}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusPill status={product.status} />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={toggleStatus.isPending}
                      onClick={() =>
                        toggleStatus.mutate({
                          id: product.id,
                          next: product.status === 'on' ? 'off' : 'on',
                        })
                      }
                    >
                      {product.status === 'on' ? '下架' : '上架'}
                    </Button>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/products/${product.id}/edit`)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => handleDelete(product)}>
                      删除
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
        {data && list.length > 0 && (
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        )}
        {data && hasMore && <p className="mt-3 mb-0 text-xs text-[#8b93a1]">还有 {Number(data.total) - loaded} 条未展示，可翻页或缩小筛选范围</p>}
      </Panel>
    </div>
  )
}

export default AdminProducts
