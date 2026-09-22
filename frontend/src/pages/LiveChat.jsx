import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import iconChat from '../assets/help/icon-chat.svg'
import iconImage from '../assets/chat/icon-image.svg'
import iconSend from '../assets/chat/icon-send.svg'
import { useChatStore } from '../stores/chatStore'

const BUBBLE = 'min-h-[46px] flex flex-col justify-center px-[18px] py-[9px]'
const BUBBLE_TEXT = 'm-0 text-sm font-medium leading-5 tracking-[-0.2px] text-black'

function AgentBubble({ message }) {
  return (
    <div className="flex items-start gap-[16px] pl-[11px]">
      <span className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[#00b861]">
        <img className="w-[20px] h-[17px] object-contain" src={iconChat} alt="" />
      </span>
      <div className={`${BUBBLE} max-w-[202px] rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[0px] bg-[#e5f3ea]/30`}>
        <p className={BUBBLE_TEXT}>{message.text}</p>
        {message.link && <MessageLink link={message.link} />}
      </div>
    </div>
  )
}

function UserBubble({ message }) {
  return (
    <div className="flex justify-end">
      <div className={`${BUBBLE} max-w-[209px] rounded-tl-[15px] rounded-tr-[15px] rounded-bl-[15px] rounded-br-[0px] bg-[#f9f8f6]`}>
        {message.file ? (
          <div className="flex flex-col gap-1">
            {message.file.url && (
              <img
                className="max-h-[120px] w-full rounded-[8px] object-cover"
                src={message.file.url}
                alt={message.file.name}
              />
            )}
            <p className={BUBBLE_TEXT}>
              图片 · {message.file.name}
              <span className="text-[#b6bbb9]"> {message.file.size} KB</span>
            </p>
          </div>
        ) : (
          <p className={BUBBLE_TEXT}>{message.text}</p>
        )}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-[16px] pl-[11px]">
      <span className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[#00b861]">
        <img className="w-[20px] h-[17px] object-contain" src={iconChat} alt="" />
      </span>
      <span
        className="flex h-[46px] items-center gap-[5px] rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[0px] bg-[#e5f3ea]/30 px-[18px]"
        role="status"
      >
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="h-[5px] w-[5px] animate-bounce rounded-full bg-[#b6bbb9]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

/** 首屏历史消息未到位时的气泡骨架，宽度贴合左右两种气泡 */
function ChatSkeleton() {
  return (
    <>
      <div className="flex items-start gap-[16px] pl-[11px]" aria-hidden="true">
        <Skeleton className="h-[33px] w-[33px] shrink-0 rounded-full" />
        <Skeleton className="h-[46px] w-[202px] rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px]" />
      </div>
      <div className="flex justify-end" aria-hidden="true">
        <Skeleton className="h-[46px] w-[150px] rounded-tl-[15px] rounded-tr-[15px] rounded-bl-[15px]" />
      </div>
      <div className="flex items-start gap-[16px] pl-[11px]" aria-hidden="true">
        <Skeleton className="h-[33px] w-[33px] shrink-0 rounded-full" />
        <Skeleton className="h-[76px] w-[180px] rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px]" />
      </div>
    </>
  )
}

function MessageLink({ link }) {
  const navigate = useNavigate()
  return (
    <button
      className="mt-[6px] self-start border-none bg-none p-0 text-xs font-medium text-[#00b861] cursor-pointer"
      type="button"
      onClick={() => navigate(link.to)}
    >
      {link.label} ›
    </button>
  )
}

function LiveChat() {
  const messages = useChatStore((s) => s.messages)
  const loading = useChatStore((s) => s.loading)
  const typing = useChatStore((s) => s.typing)
  const status = useChatStore((s) => s.status)
  const ask = useChatStore((s) => s.ask)
  const load = useChatStore((s) => s.load)
  const refreshStatus = useChatStore((s) => s.refreshStatus)
  const [draft, setDraft] = useState('')
  const fileRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, typing])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatus().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshStatus])

  function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    ask(text.slice(0, 500))
  }

  function onPickFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    ask('', file)
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="Live Chat" size="sm" />

      <div className="mt-[22px] flex flex-col gap-[37px] pr-[35px] pb-[96px] pl-[22px]">
        {loading && messages.length === 0 && <ChatSkeleton />}
        {messages.map((message) =>
          message.role === 'agent' ? (
            <AgentBubble key={message.id} message={message} />
          ) : (
            <UserBubble key={message.id} message={message} />
          )
        )}
        {typing && <TypingBubble />}

        {!status.online && (
          <p className="m-0 self-center rounded-[30px] bg-[#f9f8f6] px-[14px] py-[6px] text-center text-[10px] leading-[14px] text-[#8b8b8b]">
            客服离线中，留言后将在 {status.nextOpenLabel} 回复
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="fixed bottom-[27px] left-1/2 right-0 z-10 flex w-full max-w-[480px] -translate-x-1/2 items-center gap-[19px] pr-[29px] pl-[22px]"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <button
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-none bg-[#00b861] cursor-pointer hover:brightness-110 active:brightness-90"
          type="button"
          aria-label="发送图片"
          onClick={() => fileRef.current?.click()}
        >
          <img className="w-[24px] h-[24px] object-contain" src={iconImage} alt="" />
        </button>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={onPickFile}
          tabIndex={-1}
        />

        <div className="relative flex-1">
          <input
            className="h-[44px] w-full rounded-[30px] border-[1.5px] border-[#e4e4e4] bg-white pr-[52px] pl-[26px] text-sm font-medium leading-5 tracking-[-0.2px] text-black outline-none placeholder:text-[#b6bbb9]"
            placeholder="say something..."
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className="absolute top-1/2 right-[19px] flex h-[24px] w-[24px] -translate-y-1/2 items-center justify-center border-none bg-none p-0 cursor-pointer"
            type="submit"
            aria-label="发送"
          >
            <img className="w-[24px] h-[24px] object-contain" src={iconSend} alt="" />
          </button>
        </div>
      </form>
    </div>
  )
}

export default LiveChat
