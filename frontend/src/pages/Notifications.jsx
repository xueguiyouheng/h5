import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { SkeletonListRows } from '../components/Skeleton'
import { KINDS, timeLabel, useNotificationStore } from '../stores/notificationStore'

function NotificationRow({ notification, read, onOpen }) {
  const kind = KINDS[notification.kind]
  return (
    <button
      className="relative flex w-full items-start gap-[22px] border-none bg-none py-[6.5px] pl-[30px] pr-[35px] text-left cursor-pointer"
      type="button"
      onClick={() => onOpen(notification)}
    >
      <span
        className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full ${kind.circle}`}
      >
        <img className={kind.size} src={kind.icon} alt="" />
      </span>
      <span className="flex w-[210px] min-w-0 flex-col">
        <span className="text-sm font-medium leading-5 tracking-[-0.2px] text-black">
          {notification.title}
        </span>
        <span className={`mt-[2px] line-clamp-2 text-[10px] leading-[13px] ${read ? 'text-[#b6bbb9]' : 'text-[#8b8b8b]'}`}>
          {notification.description}
        </span>
      </span>
      <span className="absolute right-[35px] top-[6.5px] flex flex-col items-end">
        <span className="text-[10px] leading-5 text-[#b6bbb9]">
          {timeLabel(notification.daysAgo)}
        </span>
        {!read && <span className="mt-[5px] h-[7px] w-[7px] rounded-full bg-[#ff7465]" />}
      </span>
    </button>
  )
}

function Notifications() {
  const navigate = useNavigate()
  const list = useNotificationStore((s) => s.list)
  const readIds = useNotificationStore((s) => s.readIds)
  const unread = useNotificationStore((s) => s.unread)
  const loading = useNotificationStore((s) => s.loading)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const load = useNotificationStore((s) => s.load)

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const open = (notification) => {
    markRead(notification.id)
    navigate(notification.link.to)
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white pb-[72px] overflow-x-clip">
      <PageHeader
        title="Notifications"
        back={false}
        right={
          unread > 0 && (
            <button
              className="border-none bg-none p-0 text-[10px] font-medium leading-5 text-[#00b861] cursor-pointer"
              type="button"
              onClick={() => markAllRead().catch(() => {})}
            >
              全部已读
            </button>
          )
        }
      />

      <div className="mt-4 pb-[24px]">
        {loading && list.length === 0 && <SkeletonListRows count={5} />}
        {!loading && list.length === 0 && (
          <p className="m-0 px-[30px] text-sm leading-5 text-[#b6bbb9]">暂无通知</p>
        )}
        {list.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            read={readIds.includes(notification.id)}
            onOpen={open}
          />
        ))}
      </div>
    </div>
  )
}

export default Notifications
