import { useState } from 'react'

import { BellIcon, ChevronLeftIcon, PinIcon, ShieldIcon } from '@/components/icons'

/*
 * 設定頁 —— 設計稿未提供，這是依現有設計系統做的提案版。
 * 色票、卡片圓角、分隔線都沿用其他頁面，設計師出稿後應整頁替換。
 *
 * 項目的挑選依據是資料庫 schema 與已實作的功能：
 *   通知     → favorite_stations.notification_enabled、delay_threshold_minutes
 *   位置     → missions 的地理圍欄需要背景定位
 *   隱私     → App Store 上架必須提供隱私權政策入口
 */

type ToggleRow = { id: string; label: string; hint?: string; on: boolean }

const INITIAL_TOGGLES: ToggleRow[] = [
  { id: 'transit-alert', label: '通勤異常提醒', hint: '捷運或公車誤點時主動通知', on: true },
  { id: 'mission-nearby', label: '附近任務通知', hint: '接近任務地點時提醒', on: true },
  { id: 'weather-alert', label: '天氣與紫外線提醒', on: true },
  { id: 'background-location', label: '背景定位', hint: '關閉後將無法接收附近任務通知', on: false },
]

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? 'var(--color-primary)' : 'var(--color-line)' }}
    >
      <span
        className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-[left]"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{title}</h2>
      <div className="divide-y divide-black/[.06] overflow-hidden rounded-2xl bg-surface">
        {children}
      </div>
    </section>
  )
}

function LinkRow({ label, value, Icon }: { label: string; value?: string; Icon?: typeof PinIcon }) {
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      {Icon && <Icon />}
      <span className="flex-1 text-[15px]">{label}</span>
      {value && <span className="text-[13px] text-subtle">{value}</span>}
      <span className="rotate-180">
        <ChevronLeftIcon />
      </span>
    </button>
  )
}

export function SettingsScreen() {
  const [toggles, setToggles] = useState(INITIAL_TOGGLES)

  const flip = (id: string) =>
    setToggles((prev) => prev.map((t) => (t.id === id ? { ...t, on: !t.on } : t)))

  return (
    <div className="min-h-full bg-surface-2 pb-6">
      <header className="bg-surface px-5 pb-5 pt-2">
        <h1 className="text-[26px] font-bold tracking-tight">設定</h1>
      </header>

      <div className="px-4">
        <Section title="通知">
          {toggles.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{t.label}</p>
                {t.hint && <p className="mt-0.5 text-[12px] text-subtle">{t.hint}</p>}
              </div>
              <Toggle on={t.on} onChange={() => flip(t.id)} label={t.label} />
            </div>
          ))}
        </Section>

        <Section title="通勤">
          <LinkRow label="常用路線" value="1 條" Icon={PinIcon} />
          <LinkRow label="誤點提醒門檻" value="5 分鐘" Icon={BellIcon} />
        </Section>

        <Section title="關於">
          <LinkRow label="隱私權政策" Icon={ShieldIcon} />
          <LinkRow label="服務條款" />
          <LinkRow label="版本" value="1.0.0 (1)" />
        </Section>
      </div>

      <p className="mt-6 px-5 text-center text-[11px] text-subtle">
        此頁為提案版，尚未取得設計稿
      </p>
    </div>
  )
}
