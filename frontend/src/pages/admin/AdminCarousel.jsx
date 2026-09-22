import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCarouselItem,
  deleteCarouselItem,
  fetchCarousel,
  formatTime,
  updateCarouselItem,
} from '../../api/admin'
import ImagePicker from './ImagePicker'
import {
  Button,
  EmptyState,
  ErrorText,
  Field,
  Panel,
  Select,
  Spinner,
  StatusPill,
  Table,
  Td,
  TextInput,
  Tr,
} from './adminUi'

const EMPTY_DRAFT = { id: null, title: '', image_url: '', link: '', sort: '0', status: 'on' }

function bySortDesc(a, b) {
  return Number(b.sort) - Number(a.sort)
}

function CarouselPreview({ items }) {
  const visible = items.filter((item) => item.status === 'on').sort(bySortDesc)
  return (
    <Panel title="首页轮播预览" description={`仅预览 status = on 的条目，按权重从大到小（当前 ${visible.length} 条）`}>
      {visible.length === 0 ? (
        <EmptyState title="没有开启中的轮播" description="新增条目并设为「显示」后即可出现在首页" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {visible.map((item) => (
            <div key={item.id} className="relative shrink-0 w-[260px] h-[120px] rounded-lg overflow-hidden border border-[#e6e9ee]">
              <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
              <span className="absolute left-0 right-0 bottom-0 px-3 py-1.5 bg-[#111827]/55 text-xs text-white truncate">
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function CarouselForm({ initial, onCancel, onSubmit, pending, submitError }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})

  const patch = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const next = {}
    if (!draft.title.trim()) next.title = '请输入标题'
    else if (draft.title.trim().length > 60) next.title = '标题不超过 60 个字符'
    if (!draft.image_url) next.image_url = '请上传或选择轮播图片'
    if (draft.sort === '' || !/^-?\d+$/.test(String(draft.sort))) next.sort = '排序权重必须是整数'
    if (draft.link.trim() && !/^(https?:\/\/|\/)/.test(draft.link.trim())) next.link = '链接需以 http(s):// 或 / 开头'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({
      title: draft.title.trim(),
      image_url: draft.image_url,
      link: draft.link.trim(),
      sort: Number(draft.sort),
      status: draft.status,
    })
  }

  return (
    <Panel title={initial.id ? `编辑轮播条目 #${initial.id}` : '新增轮播条目'}>
      <form onSubmit={handleSubmit} noValidate className="max-w-[640px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="标题" htmlFor="carousel-title" required error={errors.title}>
            <TextInput id="carousel-title" value={draft.title} onChange={patch('title')} invalid={Boolean(errors.title)} placeholder="秋季果蔬专场" />
          </Field>
          <Field label="跳转链接" htmlFor="carousel-link" hint="留空表示不跳转" error={errors.link}>
            <TextInput id="carousel-link" value={draft.link} onChange={patch('link')} invalid={Boolean(errors.link)} placeholder="/category/1" />
          </Field>
          <Field label="排序权重" htmlFor="carousel-sort" hint="数值越大越靠前" error={errors.sort}>
            <TextInput id="carousel-sort" type="number" step="1" value={draft.sort} onChange={patch('sort')} invalid={Boolean(errors.sort)} />
          </Field>
          <Field label="状态" htmlFor="carousel-status">
            <Select id="carousel-status" value={draft.status} onChange={patch('status')}>
              <option value="on">显示</option>
              <option value="off">隐藏</option>
            </Select>
          </Field>
        </div>

        <Field label="轮播图片" htmlFor="carousel-image" required error={errors.image_url}>
          <ImagePicker
            value={draft.image_url}
            alt={draft.title || '轮播图片'}
            onChange={(url) => setDraft((prev) => ({ ...prev, image_url: url }))}
          />
        </Field>

        {submitError && <ErrorText message={submitError} />}

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? '保存中…' : initial.id ? '保存修改' : '创建条目'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function AdminCarousel() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(null)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'carousel'],
    queryFn: fetchCarousel,
  })
  const items = data?.list ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'carousel'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  const save = useMutation({
    mutationFn: ({ id, payload }) => (id ? updateCarouselItem(id, payload) : createCarouselItem(payload)),
    onSuccess: () => {
      invalidate()
      setDraft(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id) => deleteCarouselItem(id),
    onSuccess: invalidate,
  })

  const handleDelete = (item) => {
    if (window.confirm(`确定删除轮播「${item.title}」吗？`)) remove.mutate(item.id)
  }

  const startEdit = (item) => {
    save.reset()
    setDraft({
      id: item.id,
      title: item.title,
      image_url: item.image_url,
      link: item.link || '',
      sort: String(item.sort),
      status: item.status,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {isPending && <Spinner label="轮播配置加载中..." />}
      {isError && <ErrorText message={error instanceof Error ? error.message : '轮播配置加载失败'} onRetry={() => refetch()} />}

      {data && (
        <>
          <CarouselPreview items={items} />

          {draft && (
            <CarouselForm
              key={draft.id ?? 'new'}
              initial={draft}
              pending={save.isPending}
              submitError={save.isError && save.error instanceof Error ? save.error.message : ''}
              onCancel={() => setDraft(null)}
              onSubmit={(payload) => save.mutate({ id: draft.id, payload })}
            />
          )}

          <Panel
            title="轮播条目"
            description={`共 ${items.length} 条`}
            actions={
              <Button size="sm" onClick={() => setDraft({ ...EMPTY_DRAFT })} disabled={Boolean(draft)}>
                新增条目
              </Button>
            }
          >
            {remove.isError && (
              <ErrorText message={remove.error instanceof Error ? remove.error.message : '删除失败，请重试'} />
            )}
            {items.length === 0 ? (
              <EmptyState title="还没有轮播配置" description="点击右上角「新增条目」开始配置" />
            ) : (
              <>
                <ul className="m-0 p-0 list-none flex flex-col gap-3 md:hidden">
                  {[...items].sort(bySortDesc).map((item) => (
                    <li key={item.id} className="rounded-md border border-[#e6e9ee] p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-[92px] h-[52px] shrink-0 rounded-md object-cover border border-[#eef0f3]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#111827] break-words">{item.title}</div>
                          <div className="mt-1 text-xs text-[#8b93a1]">权重 {item.sort} · {formatTime(item.updated_at)}</div>
                        </div>
                        <div className="shrink-0">
                          <StatusPill status={item.status} />
                        </div>
                      </div>
                      {item.link && (
                        <div className="mt-2 text-xs text-[#6b7280] break-all">跳转：{item.link}</div>
                      )}
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={save.isPending || Boolean(draft)}
                          onClick={() => startEdit(item)}
                        >
                          编辑
                        </Button>
                        <Button variant="danger" size="sm" disabled={remove.isPending} onClick={() => handleDelete(item)}>
                          删除
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <Table className="hidden md:block" head={['图片', '标题', '跳转链接', '排序', '状态', '更新时间', '操作']}>
                  {[...items].sort(bySortDesc).map((item) => (
                    <Tr key={item.id}>
                      <Td className="w-[92px]">
                        <img src={item.image_url} alt={item.title} className="w-[80px] h-[45px] object-cover rounded" />
                      </Td>
                      <Td className="font-medium">{item.title}</Td>
                      <Td className="text-xs text-[#6b7280]">{item.link || '-'}</Td>
                      <Td className="tabular-nums">{item.sort}</Td>
                      <Td>
                        <StatusPill status={item.status} />
                      </Td>
                      <Td className="text-xs text-[#8b93a1] whitespace-nowrap">{formatTime(item.updated_at)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" disabled={save.isPending || Boolean(draft)} onClick={() => startEdit(item)}>
                            编辑
                          </Button>
                          <Button variant="danger" size="sm" disabled={remove.isPending} onClick={() => handleDelete(item)}>
                            删除
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

export default AdminCarousel
