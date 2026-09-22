import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteUpload, fetchUploads, formatTime } from '../../api/admin'
import { Button, EmptyState, ErrorText, PaginationBar, Panel, Spinner } from './adminUi'

const PAGE_SIZE = 24

function formatSize(item) {
  const bytes = Number(item.size)
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function copyTextLegacy(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  return ok
}

function AdminMedia() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [hiddenUrls, setHiddenUrls] = useState([])
  const [copiedUrl, setCopiedUrl] = useState('')
  const [copyFailed, setCopyFailed] = useState('')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'uploads', page, PAGE_SIZE],
    queryFn: () => fetchUploads({ page, pageSize: PAGE_SIZE }),
  })

  const remove = useMutation({
    mutationFn: (id) => deleteUpload(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'uploads'] }),
  })

  const items = (data?.list ?? []).filter((item) => !hiddenUrls.includes(item.url))
  const total = Number(data?.total ?? 0)
  const hiddenCount = hiddenUrls.length

  const handleCopy = async (url) => {
    setCopiedUrl('')
    setCopyFailed('')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else if (!copyTextLegacy(url)) {
        throw new Error('浏览器不支持自动复制')
      }
      setCopiedUrl(url)
    } catch {
      setCopyFailed(url)
    }
  }

  const handleRemove = (item) => {
    const message = item.id
      ? `确定删除素材「${item.name}」吗？`
      : `该素材没有可删除的 ID，将从列表中隐藏「${item.name}」，确定吗？`
    if (!window.confirm(message)) return
    if (item.id) {
      remove.mutate(item.id)
      return
    }
    setHiddenUrls((prev) => (prev.includes(item.url) ? prev : [...prev, item.url]))
  }

  return (
    <Panel
      title="素材库"
      description={
        data
          ? `共 ${total} 个素材 · 每页 ${data.page_size} 个${hiddenCount ? ` · 已本地隐藏 ${hiddenCount} 个` : ''}`
          : '上传过的图片都在这里，可直接复用到轮播 / 类目 / 商品'
      }
      actions={
        hiddenCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setHiddenUrls([])}>
            显示已隐藏素材
          </Button>
        ) : null
      }
    >
      {isPending && <Spinner label="素材加载中..." />}
      {isError && <ErrorText message={error instanceof Error ? error.message : '素材加载失败'} onRetry={() => refetch()} />}
      {remove.isError && (
        <ErrorText message={remove.error instanceof Error ? remove.error.message : '删除失败，请重试'} />
      )}
      {copiedUrl && <p className="mt-0 mb-3 text-xs text-[#00894a]">已复制：{copiedUrl}</p>}

      {data && items.length === 0 && (
        <EmptyState
          title={total > 0 ? '本页素材已被隐藏' : '还没有上传任何素材'}
          description="在商品 / 轮播 / 类目的图片选择区上传后，这里会出现记录"
        />
      )}

      {data && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <figure key={item.url} className="m-0 rounded-lg border border-[#e6e9ee] bg-white overflow-hidden">
                <img src={item.url} alt={item.name} className="w-full h-32 object-cover bg-[#f7f8fa]" />
                <figcaption className="p-3">
                  <div className="truncate text-[13px] font-medium text-[#111827]" title={item.name}>
                    {item.name}
                  </div>
                  <div className="mt-1 text-[11px] text-[#8b93a1]">
                    {formatSize(item)} · {item.mime || '未知类型'}
                  </div>
                  <div className="mt-1 text-[11px] text-[#aab2bd]">{formatTime(item.created_at)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleCopy(item.url)}>
                      复制地址
                    </Button>
                    <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => handleRemove(item)}>
                      删除
                    </Button>
                  </div>
                  {copyFailed === item.url && (
                    <p className="mt-2 mb-0 text-[11px] text-[#b42318]" role="alert">
                      复制失败，请手动选择地址：
                    </p>
                  )}
                  {copyFailed === item.url && (
                    <code className="mt-1 block text-[10px] leading-4 break-all text-[#6b7280] select-all">{item.url}</code>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          <PaginationBar page={data.page} pageSize={data.page_size} total={total} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}

export default AdminMedia
