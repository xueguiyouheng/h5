import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  formatTime,
  updateCategory,
} from '../../api/admin'
import ImagePicker from './ImagePicker'
import {
  Button,
  EmptyState,
  ErrorText,
  Field,
  Modal,
  PaginationBar,
  Panel,
  Select,
  Spinner,
  StatusPill,
  TextInput,
} from './adminUi'

const PAGE_SIZE = 10
const EMPTY_DRAFT = { id: null, name: '', image_url: '', sort: '0', status: 'on', subs: [''] }

function toPayload(draft, subNames) {
  const subs = subNames.map((name) => name.trim()).filter(Boolean)
  return {
    name: draft.name.trim(),
    image_url: draft.image_url,
    sort: Number(draft.sort),
    status: draft.status,
    subcategories: subs.map((name) => ({ name })),
  }
}

function validate(draft, subNames) {
  const errors = {}
  if (!draft.name.trim()) errors.name = '请输入类目名称'
  else if (draft.name.trim().length > 30) errors.name = '类目名称不超过 30 个字符'
  if (!/^-?\d+$/.test(String(draft.sort))) errors.sort = '排序权重必须是整数'
  const valid = subNames.map((name) => name.trim()).filter(Boolean)
  if (new Set(valid).size !== valid.length) errors.subs = '子分类名称不能重复'
  return errors
}

function SubCategoryEditor({ names, onChange, onSave, onCancel, pending, error, showActions = true, idPrefix = 'sub' }) {
  const patchName = (index) => (event) => {
    const value = event.target.value
    onChange((prev) => prev.map((name, i) => (i === index ? value : name)))
  }
  const inputId = (index) => `${idPrefix}-${index}`

  return (
    <div className="rounded-md border border-[#e6e9ee] bg-[#fbfcfd] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-[#374151]">子分类（{names.filter((n) => n.trim()).length}）</span>
        <Button size="sm" variant="ghost" onClick={() => onChange((prev) => [...prev, ''])}>
          添加子分类
        </Button>
      </div>
      {names.length === 0 && <p className="m-0 text-xs text-[#9aa3af]">该类目暂无子分类，点击上方按钮添加。</p>}
      <div className="flex flex-col gap-2">
        {names.map((name, index) => (
          <div key={index} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={inputId(index)}>
              第 {index + 1} 个子分类名称
            </label>
            <input
              id={inputId(index)}
              className="flex-1 h-8 px-3 rounded-md border border-[#d6dbe1] bg-white text-sm text-[#1f2937] outline-none focus:border-[#00b861]"
              value={name}
              placeholder="例如 叶菜类"
              onChange={patchName(index)}
            />
            <Button
              size="sm"
              variant="danger"
              onClick={() => onChange((prev) => prev.filter((_, i) => i !== index))}
            >
              移除
            </Button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 mb-0 text-xs text-[#b42318]" role="alert">{error}</p>}
      {showActions && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button size="sm" type="button" onClick={onSave} disabled={pending}>
            {pending ? '保存中…' : '保存子分类'}
          </Button>
        </div>
      )}
    </div>
  )
}

function CategoryFormModal({ initial, onClose, onSubmit, pending, submitError }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})
  const patch = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const next = validate(draft, draft.subs)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit(toPayload(draft, draft.subs))
  }

  return (
    <Modal title={initial.id ? `编辑类目 #${initial.id}` : '新增类目'} onClose={onClose} width={640}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="类目名称" htmlFor="category-name" required error={errors.name}>
            <TextInput
              id="category-name"
              value={draft.name}
              onChange={patch('name')}
              invalid={Boolean(errors.name)}
              placeholder="蔬菜"
            />
          </Field>
          <Field label="排序权重" htmlFor="category-sort" hint="数值越大越靠前" error={errors.sort}>
            <TextInput id="category-sort" type="number" step="1" value={draft.sort} onChange={patch('sort')} invalid={Boolean(errors.sort)} />
          </Field>
          <Field label="状态" htmlFor="category-status">
            <Select id="category-status" value={draft.status} onChange={patch('status')}>
              <option value="on">启用</option>
              <option value="off">停用</option>
            </Select>
          </Field>
        </div>

        <Field label="类目图片" htmlFor="category-image" error={errors.image_url}>
          <ImagePicker
            value={draft.image_url}
            alt={draft.name || '类目图片'}
            onChange={(url) => setDraft((prev) => ({ ...prev, image_url: url }))}
          />
        </Field>

        <div className="mb-4">
          <span className="block mb-2 text-[13px] font-medium text-[#374151]">子分类</span>
          <SubCategoryEditor
            names={draft.subs}
            error={errors.subs}
            showActions={false}
            idPrefix={`modal-${initial.id ?? 'new'}`}
            onChange={(updater) => setDraft((prev) => ({ ...prev, subs: updater(prev.subs) }))}
          />
        </div>

        {submitError && <ErrorText message={submitError} />}

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? '保存中…' : initial.id ? '保存修改' : '创建类目'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AdminCategories() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [subNames, setSubNames] = useState([])
  const [subError, setSubError] = useState('')
  const [draft, setDraft] = useState(null)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'categories', page, PAGE_SIZE],
    queryFn: () => fetchCategories({ page, pageSize: PAGE_SIZE }),
  })
  const list = data?.list ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
  }

  const save = useMutation({
    mutationFn: ({ id, payload }) => (id ? updateCategory(id, payload) : createCategory(payload)),
    onSuccess: () => {
      invalidate()
      setDraft(null)
      setExpandedId(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: () => {
      invalidate()
      setExpandedId(null)
    },
  })

  const toggleExpand = (category) => {
    if (expandedId === category.id) {
      setExpandedId(null)
      return
    }
    setSubError('')
    setSubNames((category.subcategories ?? []).map((sub) => sub.name))
    setExpandedId(category.id)
  }

  const openCreate = () => {
    save.reset()
    setDraft({ ...EMPTY_DRAFT, subs: [''] })
  }

  const openEdit = (category) => {
    save.reset()
    setDraft({
      id: category.id,
      name: category.name,
      image_url: category.image_url || '',
      sort: String(category.sort),
      status: category.status,
      subs: (category.subcategories ?? []).map((sub) => sub.name),
    })
  }

  const handleDelete = (category) => {
    if (window.confirm(`确定删除类目「${category.name}」吗？该操作会移除其子分类配置。`)) remove.mutate(category.id)
  }

  const saveSubcategories = (category) => {
    const errors = validate({ name: category.name, sort: String(category.sort) }, subNames)
    setSubError(errors.subs || '')
    if (errors.subs) return
    save.mutate({
      id: category.id,
      payload: toPayload(
        { name: category.name, image_url: category.image_url || '', sort: String(category.sort), status: category.status },
        subNames
      ),
    })
  }

  const toggleStatus = (category) => {
    save.mutate({
      id: category.id,
      payload: toPayload(
        {
          name: category.name,
          image_url: category.image_url || '',
          sort: String(category.sort),
          status: category.status === 'on' ? 'off' : 'on',
        },
        (category.subcategories ?? []).map((sub) => sub.name)
      ),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="类目管理"
        description={data ? `共 ${data.total} 个类目 · 每页 ${data.page_size} 个` : '维护首页类目与子分类'}
        actions={
          <Button size="sm" onClick={openCreate} disabled={save.isPending}>
            新增类目
          </Button>
        }
      >
        {isPending && <Spinner label="类目加载中..." />}
        {isError && <ErrorText message={error instanceof Error ? error.message : '类目加载失败'} onRetry={() => refetch()} />}
        {save.isError && <ErrorText message={save.error instanceof Error ? save.error.message : '保存失败，请重试'} />}
        {remove.isError && <ErrorText message={remove.error instanceof Error ? remove.error.message : '删除失败，请重试'} />}

        {data && list.length === 0 && (
          <EmptyState
            title={page > 1 ? '当前页没有类目' : '还没有类目'}
            description={page > 1 ? '使用下方分页回到有数据的页码' : '点击右上角「新增类目」创建第一个类目'}
          />
        )}

        {data && list.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-col gap-3">
            {list.map((category) => {
              const expanded = expandedId === category.id
              const subs = category.subcategories ?? []
              return (
                <li key={category.id} className="rounded-md border border-[#e6e9ee]">
                  <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <div className="flex items-start min-w-0 flex-1 gap-3 md:items-center">
                      <div className="w-11 h-11 shrink-0 rounded-md overflow-hidden bg-[#f7f8fa] border border-[#eef0f3]">
                        {category.image_url ? (
                          <img src={category.image_url} alt={category.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="flex w-full h-full items-center justify-center text-[10px] text-[#aab2bd]">
                            无图
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#111827]">{category.name}</span>
                          <StatusPill status={category.status} />
                        </div>
                        <div className="mt-1 text-xs text-[#8b93a1]">
                          #{category.id} · 排序 {category.sort} · {subs.length} 个子分类 · {category.product_count} 个商品 ·
                          更新于 {formatTime(category.updated_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={expanded}
                        onClick={() => toggleExpand(category)}
                      >
                        {expanded ? '收起子分类' : `子分类 (${subs.length})`}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(category)} disabled={save.isPending}>
                        {category.status === 'on' ? '停用' : '启用'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(category)} disabled={save.isPending}>
                        编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(category)} disabled={remove.isPending}>
                        删除
                      </Button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="px-4 pb-4">
                      <SubCategoryEditor
                        names={subNames}
                        error={subError}
                        pending={save.isPending}
                        idPrefix={`row-${category.id}`}
                        onChange={setSubNames}
                        onSave={() => saveSubcategories(category)}
                        onCancel={() => setSubNames(subs.map((sub) => sub.name))}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {data && (
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        )}
      </Panel>

      {draft && (
        <CategoryFormModal
          key={draft.id ?? 'new'}
          initial={draft}
          pending={save.isPending}
          submitError={save.isError && save.error instanceof Error ? save.error.message : ''}
          onClose={() => setDraft(null)}
          onSubmit={(payload) => save.mutate({ id: draft.id, payload })}
        />
      )}
    </div>
  )
}

export default AdminCategories
