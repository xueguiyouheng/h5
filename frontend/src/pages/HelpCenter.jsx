import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import CollapsibleRow from '../components/CollapsibleRow'
import { Skeleton } from '../components/Skeleton'
import QueryError from '../components/QueryError'
import iconChat from '../assets/help/icon-chat.svg'
import { resolvedCount, useHelpStore, voteLabel } from '../stores/helpStore'

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3C7.6 3 4 6.4 4 10.5c0 2.4 1.2 4.6 3.1 6 .2.2.3.4.3.7l.1 1.7c0 .5.5.8.9.5l2-1.1c.4-.2.8-.3 1.2-.3h.4c4.4 0 8-3.4 8-7.5S16.4 3 12 3z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.8" cy="10.6" r="1.1" fill="#fff" />
      <circle cx="12.2" cy="10.6" r="1.1" fill="#fff" />
      <circle cx="15.6" cy="10.6" r="1.1" fill="#fff" />
    </svg>
  )
}

function HelpCenter() {
  const navigate = useNavigate()
  const faqs = useHelpStore((s) => s.faqs)
  const support = useHelpStore((s) => s.support)
  const votes = useHelpStore((s) => s.votes)
  const vote = useHelpStore((s) => s.vote)
  const load = useHelpStore((s) => s.load)
  const loading = useHelpStore((s) => s.loading)
  const error = useHelpStore((s) => s.error)
  const [open, setOpen] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const resolved = resolvedCount(votes)

  function toggle(id) {
    setOpen((prev) => (prev === id ? null : id))
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="Help Center" />

      <div className="mt-[28px] px-[24px]">
        <h2 className="m-0 pl-[6px] text-base font-medium leading-5 tracking-[-0.2px] text-black">
          Frequently asked questions
        </h2>

        <div className="mt-[10px]">
          {faqs.length === 0 &&
            (error ? (
              <QueryError error={error} onRetry={load} className="py-[19px] pl-[6px]" />
            ) : loading ? (
              <div aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between py-[19px] pl-[6px] pr-[6px]">
                    <Skeleton className="h-[14px] w-[180px] rounded" />
                    <Skeleton className="h-[14px] w-[36px] rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 py-[19px] pl-[6px] text-xs leading-[18px] text-[#b6bbb9]">暂无常见问题</p>
            ))}
          {faqs.map((faq, index) => (
            <div key={faq.id}>
              <CollapsibleRow
                label={faq.question}
                value={voteLabel(votes, faq.id)}
                labelClassName="text-[#b6bbb9]"
                rowPadding="py-[19px]"
                open={open === faq.id}
                onToggle={() => toggle(faq.id)}
              >
                <p className="m-0 text-xs leading-[18px] text-[#8b8b8b]">{faq.answer}</p>
                {faq.link.label && (
                  <button
                    className="mt-[8px] border-none bg-none p-0 text-xs font-medium text-[#00b861] cursor-pointer"
                    type="button"
                    onClick={() => navigate(faq.link.to)}
                  >
                    {faq.link.label} ›
                  </button>
                )}
                <div className="mt-[10px] flex items-center gap-[8px]">
                  <span className="text-[10px] text-[#b6bbb9]">这条回答有帮助吗？</span>
                  <button
                    className="h-[22px] px-[10px] rounded-full border text-[10px] cursor-pointer"
                    style={
                      votes[faq.id] === true
                        ? { backgroundColor: '#00b861', borderColor: '#00b861', color: '#fff' }
                        : { backgroundColor: '#fff', borderColor: '#e4e4e4', color: '#8b8b8b' }
                    }
                    type="button"
                    onClick={() => vote(faq.id, true)}
                  >
                    有用
                  </button>
                  <button
                    className="h-[22px] px-[10px] rounded-full border text-[10px] cursor-pointer"
                    style={
                      votes[faq.id] === false
                        ? { backgroundColor: '#8b8b8b', borderColor: '#8b8b8b', color: '#fff' }
                        : { backgroundColor: '#fff', borderColor: '#e4e4e4', color: '#8b8b8b' }
                    }
                    type="button"
                    onClick={() => vote(faq.id, false)}
                  >
                    没用
                  </button>
                </div>
              </CollapsibleRow>
              {index < faqs.length - 1 && <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />}
            </div>
          ))}
        </div>

        <p className="m-0 mt-[14px] pl-[6px] text-[10px] leading-[13px] text-[#b6bbb9]">
          {faqs.length > 0 ? `${resolved}/${faqs.length} 个问题已解决` : ' '}
        </p>
      </div>

      <div className="fixed bottom-[70px] left-1/2 right-0 z-10 flex w-full max-w-[480px] -translate-x-1/2 justify-end px-[42px] pointer-events-none">
        <div className="relative pointer-events-none">
          {chatOpen && (
            <div className="absolute bottom-[85px] right-0 w-[210px] rounded-[12px] bg-[#f9f8f6] px-[16px] py-[14px] pointer-events-auto">
              <p className="m-0 text-[10px] leading-[18px] text-[#8b8b8b]">{support.hours}</p>
              <a
                className="block text-[10px] leading-[18px] text-black no-underline"
                href={`tel:${(support.phone ?? '').replace(/[^+\d]/g, '')}`}
              >
                {support.phone}
              </a>
              <a
                className="block text-[10px] leading-[18px] text-black no-underline"
                href={`mailto:${support.email}`}
              >
                {support.email}
              </a>
              <button
                className="mt-[6px] border-none bg-none p-0 text-left text-[10px] font-medium leading-[18px] text-[#00b861] cursor-pointer"
                type="button"
                onClick={() => navigate('/chat')}
              >
                发起在线客服 ›
              </button>
            </div>
          )}

          <button
            className="pointer-events-auto flex h-[73px] w-[73px] items-center justify-center rounded-full border-none bg-[#00b861] cursor-pointer hover:brightness-110 active:brightness-90"
            type="button"
            aria-label="联系在线客服"
            aria-expanded={chatOpen}
            onClick={() => setChatOpen((prev) => !prev)}
          >
            {chatOpen ? (
              <ChatIcon />
            ) : (
              <img className="w-[44px] h-[39px] object-contain" src={iconChat} alt="" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default HelpCenter
