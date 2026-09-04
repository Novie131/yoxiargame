import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { TransitStatus } from '@/components/TransitStatus'
import { TransportCard } from '@/components/TransportCard'
import { PinIcon } from '@/components/icons'
import {
  metroLineOf,
  save,
  useCommuteRoute,
  WEEKDAYS,
  type CommuteRoute,
  type TransportMode,
} from '@/lib/commute'
import { createConversation } from '@/lib/conversation'
import { useStationSuggestions } from '@/lib/stations'

/*
 * 對應設計稿 frame：首頁 Agent_通勤路線設定
 *
 * 設計稿畫的是一段已經談完的對話（板橋 → 市政府），這裡原本就照著寫死，
 * 連輸入框都是不能打字的展示品 —— 按下 CTA 只是把那條假路線存進本機。
 * 現在改成兩條路都是真的，而且寫進同一個地方（lib/commute → POST /commute/route）：
 *
 *   用講的：對話直接接 /agent/chat，模型呼叫 save_commute_route 存好之後，
 *           後端會回一個 commute_route 事件，畫面立刻跟著更新。
 *   用填的：下面的表單，站名從 TDX 站表挑，確保之後查得到即時狀態。
 *
 * 路線名（板南線）不再由畫面提供，改由後端從起訖站反推；推不出來就不顯示，
 * 不要猜一條線。同理，這裡也不再顯示「約 25 分鐘」「3 個轉乘站」——
 * 那些數字沒有任何資料來源。
 *
 * 表單多問了通知時段，因為主動通知需要它：不知道使用者幾點通勤，
 * 就只能在半夜也推「板南線有異常」。預設值是常見的上班族作息，
 * 使用者看得到也改得動，比在背後偷偷假設好。
 */

const INTRO =
  '嗨！為了讓您每天的通勤更順暢，想先了解一下您平常的上班路線。' +
  '可以直接跟我說，例如「我每天從板橋搭捷運到市政府」，或用下面的表單填。'

/* 放在模組層，切到別的分頁再回來時對話不會消失 */
const conversation = createConversation(INTRO)

/*
 * 運具。
 *
 * 火車與高鐵是為了之後的跨縣市通勤預留的，先呈現按鈕、還不能選：
 * TDX 有台鐵（TRA）與高鐵（THSR）的資料，但這裡的路線推導、即時狀態、
 * 事件監看目前全都只認台北捷運，選了也不會有任何作用。
 *
 * 刻意做成「看得到但按不下去」而不是直接能選 —— 讓使用者存下一條
 * 系統根本盯不住的路線，比先不給更糟：他會以為誤點時有人會通知他。
 */
type ModeOption = {
  value: TransportMode | 'train' | 'hsr'
  label: string
  /** false 代表只是預告，還不能選 */
  available: boolean
}

const MODES: ModeOption[] = [
  { value: 'metro', label: '捷運', available: true },
  { value: 'bus', label: '公車', available: true },
  { value: 'mixed', label: '混合', available: true },
  { value: 'train', label: '火車', available: false },
  { value: 'hsr', label: '高鐵', available: false },
]

/* 預設時段。涵蓋一般的上下班往返，同時把深夜擋在外面。 */
const DEFAULT_TIME_START = '07:00'
const DEFAULT_TIME_END = '21:00'

/* 預設平日。週末不通勤的人佔多數，而且使用者一眼就看得出來要不要改。 */
const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']

/* 站名輸入。捷運會給建議清單，公車沒有站表可對，就讓使用者自己打。 */
function StationField({
  label,
  value,
  onChange,
  placeholder,
  suggest,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  suggest: boolean
}) {
  const [focused, setFocused] = useState(false)
  const suggestions = useStationSuggestions(suggest && focused ? value : '')

  /* 已經選到完全相符的站就別再擋著畫面 */
  const open =
    focused && suggestions.length > 0 && suggestions[0].name !== value.trim()

  return (
    <label className="relative block">
      <span className="text-[12px] text-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        /* 延後關閉，否則點建議項時清單已經先消失了 */
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-xl bg-surface-3 px-3.5 text-[15px] outline-none placeholder:text-subtle focus:ring-2 focus:ring-primary/40"
      />

      {open && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-surface shadow-[0_6px_24px_rgba(22,32,55,.14)]">
          {suggestions.map((s) => (
            <li key={s.stationId}>
              <button
                type="button"
                /* 用 mouseDown 才趕得及在 input 失焦之前把值填進去 */
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s.name)
                  setFocused(false)
                }}
                className="flex w-full items-baseline justify-between px-3.5 py-2.5 text-left active:bg-surface-2"
              >
                <span className="text-[15px]">{s.name}</span>
                <span className="text-[12px] text-subtle">{s.lines.join('・')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}

function SetupForm({ onSaved }: { onSaved: (transferRequired: boolean) => void }) {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [mode, setMode] = useState<TransportMode>('metro')
  const [days, setDays] = useState<string[]>(DEFAULT_DAYS)
  const [limitTime, setLimitTime] = useState(true)
  const [timeStart, setTimeStart] = useState(DEFAULT_TIME_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIME_END)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = origin.trim() !== '' && destination.trim() !== ''

  const toggleDay = (value: string) =>
    setDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || saving) return

    setSaving(true)
    setError(null)
    try {
      const result = await save({
        origin,
        destination,
        mode,
        /* 七天全選就等於不限制，送空陣列讓後端少存一份等價的資料 */
        usualDays: days.length === WEEKDAYS.length ? [] : days,
        usualTimeStart: limitTime ? timeStart : null,
        usualTimeEnd: limitTime ? timeEnd : null,
      })
      onSaved(result.transferRequired)
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-surface p-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]"
    >
      <div className="flex items-center gap-2">
        <PinIcon />
        <h2 className="text-[15px] font-semibold">直接填寫</h2>
      </div>

      <div className="mt-3 space-y-3">
        <StationField
          label="出發站"
          value={origin}
          onChange={setOrigin}
          placeholder="例如：板橋"
          suggest={mode !== 'bus'}
        />
        <StationField
          label="目的站"
          value={destination}
          onChange={setDestination}
          placeholder="例如：市政府"
          suggest={mode !== 'bus'}
        />
      </div>

      <div className="mt-3">
        <span className="text-[12px] text-subtle">主要運具</span>
        {/* 五個選項排一列在手機上太窄，改成三欄 */}
        <div className="mt-1 grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const selected = m.available && mode === m.value

            return (
              <button
                key={m.value}
                type="button"
                disabled={!m.available}
                onClick={() => m.available && setMode(m.value as TransportMode)}
                aria-pressed={selected}
                className={[
                  'relative rounded-xl py-2.5 text-[14px] font-semibold transition-colors',
                  selected ? 'bg-primary text-white' : 'bg-surface-3 text-muted',
                  m.available ? '' : 'opacity-50',
                ].join(' ')}
              >
                {m.label}
                {!m.available && (
                  <span className="ml-1 align-middle text-[10px] font-medium">規劃中</span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          火車與高鐵為跨縣市通勤預留，路線規劃與誤點通知尚未支援。
        </p>
      </div>

      <div className="mt-4 border-t border-black/[.07] pt-3">
        <p className="text-[12px] text-subtle">通知時段</p>
        <p className="mt-0.5 text-[12px] text-muted">
          只在這些時間通知你，避免半夜被吵醒。
        </p>

        <div className="mt-2 flex gap-1.5">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              aria-pressed={days.includes(d.value)}
              className={[
                'h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors',
                days.includes(d.value)
                  ? 'bg-primary text-white'
                  : 'bg-surface-3 text-muted',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={limitTime}
            onChange={(e) => setLimitTime(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          <span className="text-[13px]">限制時段</span>
        </label>

        {limitTime && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              aria-label="通知開始時間"
              className="h-11 flex-1 rounded-xl bg-surface-3 px-3 text-[15px] outline-none"
            />
            <span className="text-[13px] text-subtle">至</span>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              aria-label="通知結束時間"
              className="h-11 flex-1 rounded-xl bg-surface-3 px-3 text-[15px] outline-none"
            />
          </div>
        )}

        {days.length === 0 && (
          <p className="mt-2 text-[12px] text-primary">沒有選任何一天就不會收到通知。</p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-primary-tint px-3 py-2 text-[13px] text-primary" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || saving}
        className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-50"
      >
        {saving ? '儲存中…' : '儲存通勤路線'}
      </button>
    </form>
  )
}

/* 把時段講成人話。空的星期陣列代表每天，不是都不。 */
function describeWindow(route: CommuteRoute): string {
  const days =
    route.usualDays.length === 0
      ? '每天'
      : `週${route.usualDays
          .map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? '')
          .join('')}`

  const time =
    route.usualTimeStart && route.usualTimeEnd
      ? `${route.usualTimeStart}–${route.usualTimeEnd}`
      : '全天（深夜除外）'

  return `${days} ${time}`
}

/* 存好之後的確認卡。內容全部來自實際存下來的路線，沒有補任何裝飾用的數字。 */
function SavedCard({
  route,
  transferRequired,
  onDone,
}: {
  route: CommuteRoute
  transferRequired: boolean
  onDone: () => void
}) {
  const line = metroLineOf(route)

  return (
    <TransportCard
      chip="每日通勤"
      badge="已設定"
      badgeIcon={<span className="text-[12px]">⭐</span>}
      title={`${route.origin} → ${route.destination}`}
      cta="前往我的行程"
      onCta={onDone}
    >
      {transferRequired && (
        <p className="text-[13px] text-muted">這兩站沒有直達路線，中途需要轉乘。</p>
      )}
      <p className="text-[13px] text-muted">通知時段：{describeWindow(route)}</p>
      {/* 沒有可查的捷運路線名（公車、或推不出來）就只確認有記下來 */}
      {line ? (
        <TransitStatus line={line} />
      ) : (
        <p className="text-[13px] text-muted">已記下這條路線，之後有異常會通知您。</p>
      )}
    </TransportCard>
  )
}

export function CommuteSetupScreen() {
  const navigate = useNavigate()
  const { messages, busy, error } = conversation.use()
  const { route } = useCommuteRoute()
  const [transferRequired, setTransferRequired] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  /* 有新訊息或剛存好路線就捲到底，讓確認卡進到視線裡 */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, route])

  return (
    <div className="flex h-full flex-col">
      <HomeHeader
        alert={{ title: '通勤小提醒', body: '提前掌握交通狀況更安心' }}
      />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <UserMessage key={i}>{m.content}</UserMessage>
          ) : (
            <AssistantMessage key={i}>
              {m.content || <span className="text-subtle">思考中...</span>}
            </AssistantMessage>
          ),
        )}

        {error && (
          <p className="rounded-xl bg-primary-tint px-4 py-3 text-[13px] text-primary">
            {error}
          </p>
        )}

        {route ? (
          <SavedCard
            route={route}
            transferRequired={transferRequired}
            onDone={() => navigate('/trips')}
          />
        ) : (
          <SetupForm onSaved={setTransferRequired} />
        )}

        <div ref={bottomRef} />
      </div>

      <ChatComposer
        placeholder="說說您平常怎麼上班…"
        onSend={conversation.send}
        disabled={busy}
      />
    </div>
  )
}
