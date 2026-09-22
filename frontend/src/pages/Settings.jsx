import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import CollapsibleRow from '../components/CollapsibleRow'
import { LANGUAGES, languageLabel, ratingSummary, useLegalCopy, useSettingsStore } from '../stores/settingsStore'

function StarIcon({ filled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 1.8 12.5 7l5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4L7.5 7z"
        fill={filled ? '#00b861' : '#e4e4e4'}
      />
    </svg>
  )
}

function Settings() {
  const language = useSettingsStore((s) => s.language)
  const ratings = useSettingsStore((s) => s.ratings)
  const loading = useSettingsStore((s) => s.loading)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const addRating = useSettingsStore((s) => s.addRating)

  const [open, setOpen] = useState(null)
  const [picked, setPicked] = useState(0)
  const legalCopy = useLegalCopy()

  const summary = ratingSummary(ratings)

  function toggle(key) {
    setOpen((prev) => (prev === key ? null : key))
    if (key === 'rate') setPicked(0)
  }

  function rate(value) {
    addRating(value)
    setPicked(0)
    setOpen(null)
  }

  return (
    <div className="mx-auto w-full max-w-[480px] min-h-screen bg-white overflow-x-clip">
      <PageHeader title="Settings" />

      <div className="mt-[30px] px-[24px]">
        <CollapsibleRow
          label="Language"
          value={languageLabel(language)}
          valueLoading={loading}
          open={open === 'language'}
          onToggle={() => toggle('language')}
        >
          <div className="flex flex-col">
            {LANGUAGES.map((item) => (
              <button
                key={item.key}
                className="flex items-center gap-[10px] border-none bg-none py-[9px] p-0 text-left cursor-pointer"
                type="button"
                aria-pressed={item.key === language}
                onClick={() => setLanguage(item.key)}
              >
                <span
                  className={
                    'text-sm leading-5 ' +
                    (item.key === language ? 'font-medium text-[#00b861]' : 'text-black')
                  }
                >
                  {item.label}
                </span>
                {item.key === language && <span className="text-[10px] text-[#00b861]">已选择</span>}
              </button>
            ))}
          </div>
        </CollapsibleRow>

        <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />

        <CollapsibleRow
          label="Rate us"
          value={summary ? `平均 ${summary.average.toFixed(1)}★ · ${summary.count} 次` : '尚未评分'}
          valueLoading={loading && ratings.length === 0}
          open={open === 'rate'}
          onToggle={() => toggle('rate')}
        >
          <div className="flex items-center gap-[6px]" onMouseLeave={() => setPicked(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                className="flex h-5 w-5 items-center justify-center border-none bg-none p-0 cursor-pointer"
                type="button"
                aria-label={`评 ${value} 星`}
                onMouseEnter={() => setPicked(value)}
                onClick={() => rate(value)}
              >
                <StarIcon filled={value <= (picked || Math.round(summary?.average ?? 0))} />
              </button>
            ))}
            <span className="ml-[6px] text-[10px] text-[#8b8b8b]">
              {summary ? `${summary.count} 次评分，可重复评价` : '点击星星评分'}
            </span>
          </div>
        </CollapsibleRow>

        <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />

        <CollapsibleRow
          label="Terms & Conditions"
          open={open === 'terms'}
          onToggle={() => toggle('terms')}
        >
          <p className="m-0 text-xs leading-[18px] text-[#8b8b8b]">{legalCopy.terms}</p>
        </CollapsibleRow>

        <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />

        <CollapsibleRow label="Privacy Policy" open={open === 'privacy'} onToggle={() => toggle('privacy')}>
          <p className="m-0 text-xs leading-[18px] text-[#8b8b8b]">{legalCopy.privacy}</p>
        </CollapsibleRow>

        <div className="h-px bg-[#f4f5f7]" aria-hidden="true" />
      </div>
    </div>
  )
}

export default Settings
