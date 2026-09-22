import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUploads, uploadImage } from '../../api/admin'
import { Button, EmptyState, ErrorText, Modal, PaginationBar, Spinner } from './adminUi'

const LIBRARY_PAGE_SIZE = 24
const MAX_BYTES = 5 * 1024 * 1024

function truncateName(name) {
  return name.length > 22 ? `${name.slice(0, 19)}…` : name
}

function MediaLibrary({ onClose, onPick }) {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'uploads', page, LIBRARY_PAGE_SIZE],
    queryFn: () => fetchUploads({ page, pageSize: LIBRARY_PAGE_SIZE }),
  })
  const list = data?.list ?? []

  return (
    <Modal title="从素材库选择" onClose={onClose} width={720}>
      {isPending && <Spinner label="素材加载中..." className="justify-center py-8" />}
      {isError && <ErrorText message={error instanceof Error ? error.message : '素材加载失败'} onRetry={() => refetch()} />}
      {data && list.length === 0 && <EmptyState title="素材库为空" description="请先上传一张图片" />}
      {data && list.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
            {list.map((item) => (
              <button
                key={item.url}
                type="button"
                className="rounded-md border border-[#e6e9ee] bg-white p-1.5 text-left cursor-pointer hover:border-[#00b861] hover:bg-[#f6fdf9]"
                title={item.name}
                onClick={() => onPick(item.url)}
              >
                <img src={item.url} alt={item.name} className="w-full h-24 object-cover rounded" />
                <span className="mt-1 block truncate text-[11px] text-[#6b7280]">{truncateName(item.name)}</span>
              </button>
            ))}
          </div>
          <PaginationBar
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onChange={(next) => setPage(next)}
          />
        </>
      )}
    </Modal>
  )
}

function ImagePicker({ value = '', onChange, alt = '已选图片', hint = '支持拖拽 / 点击上传，图片不大于 5MB' }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const queryClient = useQueryClient()

  const upload = useMutation({
    mutationFn: (file) => uploadImage(file),
    onSuccess: (res) => {
      setLocalError('')
      onChange(res.url)
      queryClient.invalidateQueries({ queryKey: ['admin', 'uploads'] })
    },
    // Upload failure keeps the previously picked URL intact.
    onError: (err) => setLocalError(err instanceof Error ? err.message : '上传失败，请重试'),
  })

  const pickFiles = (files) => {
    const file = files && files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLocalError('只能上传图片文件')
      return
    }
    if (file.size > MAX_BYTES) {
      setLocalError(`图片大小不能超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB`)
      return
    }
    setLocalError('')
    upload.mutate(file)
  }

  const openFilePicker = () => {
    if (inputRef.current) inputRef.current.click()
  }

  const errorMessage = localError || (upload.isError
    ? upload.error instanceof Error
      ? upload.error.message
      : '上传失败，请重试'
    : '')

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="选择本地图片"
        onChange={(event) => {
          pickFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {value ? (
        <div className="flex items-start gap-3 rounded-md border border-[#e6e9ee] bg-white p-3">
          <img src={value} alt={alt} className="w-24 h-24 object-cover rounded border border-[#eef0f3]" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[#8b93a1]">图片地址</div>
            <code className="mt-1 block text-[11px] leading-5 break-all text-[#374151] select-all">{value}</code>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={openFilePicker} disabled={upload.isPending}>
                替换本地图片
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLibraryOpen(true)}>
                从素材库选择
              </Button>
              <Button variant="danger" size="sm" onClick={() => onChange('')}>
                移除
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-md border border-dashed p-4 text-center ${
            dragOver ? 'border-[#00b861] bg-[#f6fdf9]' : 'border-[#d6dbe1] bg-[#fbfcfd]'
          }`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            pickFiles(event.dataTransfer.files)
          }}
        >
          {upload.isPending ? (
            <Spinner label="图片上传中..." className="justify-center" />
          ) : (
            <>
              <div className="text-xs text-[#8b93a1]">拖拽图片到此处，或</div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={openFilePicker}>
                  点击上传
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLibraryOpen(true)}>
                  从素材库选择
                </Button>
              </div>
            </>
          )}
          {hint && <p className="mt-2 mb-0 text-[11px] text-[#aab2bd]">{hint}</p>}
        </div>
      )}

      {errorMessage && (
        <p className="mt-1.5 mb-0 text-xs text-[#b42318]" role="alert">
          {errorMessage}
        </p>
      )}

      {libraryOpen && (
        <MediaLibrary
          onClose={() => setLibraryOpen(false)}
          onPick={(url) => {
            setLocalError('')
            onChange(url)
            setLibraryOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default ImagePicker
