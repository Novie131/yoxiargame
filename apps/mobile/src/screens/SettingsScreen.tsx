import { useState } from 'react'
import { useNavigate } from 'react-router'

import { BellIcon, ChevronLeftIcon, PinIcon, ShieldIcon } from '@/components/icons'
import { setNotificationEnabled, useCommuteRoute } from '@/lib/commute'

/*
 * 設定頁 —— 設計稿未提供，這是依現有設計系統做的提案版。
 * 色票、卡片圓角、分隔線都沿用其他頁面，設計師出稿後應整頁替換。
 *
 * 這一頁的原則是：**開關只在真的會改變行為時才能按**。
 *
 * 目前只有「通勤異常提醒」有對應的後端 —— 它寫的是 commute_routes.notification_enabled，
 * 而 services/transit-watch.ts 的輪詢就是用那個欄位過濾要不要發通知的，關掉是真的會停。
 *
 * 其餘三項（附近任務、天氣提醒、背景定位）對應的功能還不存在：
 * 任務通知要先有 missions 的地理圍欄，天氣提醒要先有天氣的監看，
 * 背景定位要接原生權限。它們留在畫面上是為了保住這頁的資訊架構，
 * 但一律標成「規劃中」且不能按 —— 一個撥得動卻什麼都不會發生的開關，
 * 比沒有這個選項更糟：使用者會以為自己已經關掉了。
 */

/* 還沒有後端的項目。等各自的功能做好時，從這裡搬到上面去。 */
const PLANNED = [
  { id: 'mission-nearby', label: '附近任務通知', hint: '接近任務地點時提醒' },
  { id: 'weather-alert', label: '天氣與紫外線提醒', hint: '下雨或紫外線過量時提醒' },
  { id: 'background-location', label: '背景定位', hint: '接收附近任務通知所需' },
]

function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-40"
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

function LinkRow({
  label,
  value,
  Icon,
  onClick,
}: {
  label: string
  value?: string
  Icon?: typeof PinIcon
  /* 沒有 onClick 的列還沒有去處，就不要裝成可以按 */
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60">
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
  const navigate = useNavigate()
  const { route, configured } = useCommuteRoute()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* 沒有路線就沒有東西可以開關 —— 通知本來就是綁在路線上的 */
  const alertsOn = route?.notificationEnabled ?? false

  const toggleAlerts = () => {
    if (!route || busy) return

    setBusy(true)
    setError(null)
    setNotificationEnabled(!alertsOn)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '更新失敗，請稍後再試')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="min-h-full bg-surface-2 pb-6">
      <header className="bg-surface px-5 pb-5 pt-2">
        <h1 className="text-[26px] font-bold tracking-tight">設定</h1>
      </header>

      <div className="px-4">
        <Section title="通知">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">通勤異常提醒</p>
              <p className="mt-0.5 text-[12px] text-subtle">
                {configured
                  ? '捷運有事件通報時主動通知'
                  : '先設定通勤路線才能開啟'}
              </p>
            </div>
            <Toggle
              on={alertsOn}
              onChange={toggleAlerts}
              label="通勤異常提醒"
              disabled={!configured || busy}
            />
          </div>

          {error && (
            <p className="px-4 py-2.5 text-[12px] text-primary" role="alert">
              {error}
            </p>
          )}

          {/* 還沒有後端的項目。撥不動，並且直說原因。 */}
          {PLANNED.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-muted">
                  {t.label}
                  <span className="ml-1.5 align-middle text-[10px] font-medium">規劃中</span>
                </p>
                <p className="mt-0.5 text-[12px] text-subtle">{t.hint}</p>
              </div>
              <Toggle on={false} onChange={() => {}} label={t.label} disabled />
            </div>
          ))}
        </Section>

        <Section title="通勤">
          <LinkRow
            label="常用路線"
            /* 這裡原本寫死「1 條」，不管使用者有沒有設定過 */
            value={configured ? '1 條' : '尚未設定'}
            Icon={PinIcon}
            onClick={() => navigate('/commute-setup')}
          />
          <LinkRow
            label="誤點提醒門檻"
            /* 真實值來自 commute_routes.delay_threshold_minutes，目前還不能改 */
            value={route ? `${route.delayThresholdMinutes} 分鐘` : '—'}
            Icon={BellIcon}
          />
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
