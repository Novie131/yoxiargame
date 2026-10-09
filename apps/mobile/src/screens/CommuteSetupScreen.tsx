import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AgentCardView } from '@/components/AgentCards'
import { AssistantMessage, ThinkingDots, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { TransitStatus } from '@/components/TransitStatus'
import { TransportCard } from '@/components/TransportCard'
import { PinIcon } from '@/components/icons'
import {
  BUS_CITIES,
  metroLineOf,
  ROUTE_LABEL_TEXT,
  ROUTE_LABELS,
  save,
  useCommuteRoutes,
  WEEKDAYS,
  type CommuteRoute,
  type RouteLabel,
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
 *
 * 另外多問了兩件事，各自解鎖一個功能：
 *
 *   這是哪一條（上班／回家）  兩條路線分開存。回程不是去程的反向 ——
 *                            末班車分方向、尖峰離峰的班距完全不同。
 *   幾點要到                  出發倒數的時間錨點。沒有它就只能從現在正推
 *                            （「現在出發約 N 分鐘」），那是資訊不是提醒。
 *
 * 「幾點要到」刻意跟通知時段分開問，即使兩者都是時間：通知時段是
 * 「什麼時候的異常要通知我」，抵達時間是「我幾點要到」。共用一個欄位的話，
 * 改通知時段會默默改掉出發倒數，而使用者完全看不出因果。
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
 * 事件監看目前全都只認臺北捷運，選了也不會有任何作用。
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

/*
 * 「幾點要到」的預設值。
 *
 * 上班那條抓 09:00、回家那條抓 19:00 —— 都是常見值，而且使用者一眼看得出來
 * 要不要改。但**預設是不啟用的**（下面的 setArrival 初始為 false）：
 * 一個沒人確認過的抵達時間會算出一個沒人確認過的倒數，而倒數估錯的代價
 * 是使用者錯過會議。要他按一下才開始倒數，那一下就是確認。
 */
const DEFAULT_ARRIVE_BY: Record<RouteLabel, string> = {
  commute: '09:00',
  home: '19:00',
}

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
        className="mt-1 h-11 w-full rounded-xl bg-surface-3 px-3.5 text-[16px] outline-none placeholder:text-subtle focus:ring-2 focus:ring-primary/40"
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

function SetupForm({
  initialLabel = 'commute',
  onSaved,
}: {
  /** 從「也設定回家那條」進來時，直接停在那一條上 */
  initialLabel?: RouteLabel
  /* label 要一起回報 —— 剛存的是回家那條時，確認卡不能顯示上班那條 */
  onSaved: (label: RouteLabel, transferRequired: boolean) => void
}) {
  const [label, setLabel] = useState<RouteLabel>(initialLabel)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [mode, setMode] = useState<TransportMode>('metro')
  const [city, setCity] = useState<string>(BUS_CITIES[0].value)
  const [days, setDays] = useState<string[]>(DEFAULT_DAYS)
  const [limitTime, setLimitTime] = useState(true)
  const [timeStart, setTimeStart] = useState(DEFAULT_TIME_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIME_END)
  /* 預設不啟用，理由見 DEFAULT_ARRIVE_BY 的註解 */
  const [setArrival, setSetArrival] = useState(false)
  const [arriveBy, setArriveBy] = useState(DEFAULT_ARRIVE_BY[initialLabel])
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
        label,
        origin,
        destination,
        mode,
        /* 捷運不需要縣市，送 null 免得存一個會誤導人的值 */
        city: mode === 'metro' ? null : city,
        /* 七天全選就等於不限制，送空陣列讓後端少存一份等價的資料 */
        usualDays: days.length === WEEKDAYS.length ? [] : days,
        usualTimeStart: limitTime ? timeStart : null,
        usualTimeEnd: limitTime ? timeEnd : null,
        /* 沒勾就是 null —— 不要替使用者填一個他沒確認過的抵達時間 */
        arriveBy: setArrival ? arriveBy : null,
      })
      onSaved(result.route.label, result.transferRequired)
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

      {/*
        * 哪一條。
        *
        * 只有兩個固定選項，不讓使用者自己命名 —— 自由命名會變成一個沒人填的
        * 欄位，而兩條（上班／回家）已經解決 90% 的情況。更多就變成行程管理了，
        * 那是另一個產品。
        */}
      <div className="mt-3">
        <span className="text-[12px] text-subtle">這是哪一條</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {ROUTE_LABELS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setLabel(value)
                /* 切換時把抵達時間的預設值一起換掉，免得回家那條預設 09:00 */
                setArriveBy(DEFAULT_ARRIVE_BY[value])
              }}
              aria-pressed={label === value}
              className={[
                'rounded-xl py-2.5 text-[14px] font-semibold transition-colors',
                label === value ? 'bg-primary text-white' : 'bg-surface-3 text-muted',
              ].join(' ')}
            >
              {value === 'home' ? '🏠 ' : '💼 '}
              {ROUTE_LABEL_TEXT[value].title}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          兩條分開存，設定其中一條不會蓋掉另一條。
        </p>
      </div>

      <div className="mt-3 space-y-3">
        <StationField
          label={label === 'home' ? '出發站（公司）' : '出發站（住家）'}
          value={origin}
          onChange={setOrigin}
          placeholder={label === 'home' ? '例如：市政府' : '例如：板橋'}
          suggest={mode !== 'bus'}
        />
        <StationField
          label={label === 'home' ? '目的站（住家）' : '目的站（公司）'}
          value={destination}
          onChange={setDestination}
          placeholder={label === 'home' ? '例如：板橋' : '例如：市政府'}
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

        {/*
          * 公車一定要有縣市才查得到路線 ——「307」在臺北與臺中是不同的兩條線。
          * 捷運目前只接臺北捷運，所以不用問。
          */}
        {mode !== 'metro' && (
          <div className="mt-3">
            <span className="text-[12px] text-subtle">公車所屬縣市</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {BUS_CITIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCity(c.value)}
                  aria-pressed={city === c.value}
                  className={[
                    'rounded-xl py-2.5 text-[14px] font-semibold transition-colors',
                    city === c.value ? 'bg-primary text-white' : 'bg-surface-3 text-muted',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/*
        * 幾點要到。
        *
        * 這一格解鎖的是行程頁的出發倒數（「再 6 分鐘出門」）。沒有它就只能
        * 從現在正推「現在出發約 N 分鐘」—— 一樣誠實，但使用者得自己在心裡
        * 做減法，而他正在刷牙。
        *
        * 放在通知時段**之前**：它比通知時段更常被需要，而且兩者很容易被看成
        * 同一件事，中間隔著一條分隔線會讓那個誤會更難發生。
        */}
      <div className="mt-4 border-t border-black/[.07] pt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={setArrival}
            onChange={(e) => setSetArrival(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          <span className="text-[13px] font-semibold">設定抵達時間</span>
        </label>
        <p className="mt-0.5 text-[12px] text-muted">
          知道你幾點要到，行程頁才算得出「再幾分鐘該出門」。
        </p>

        {setArrival && (
          <>
            <input
              type="time"
              value={arriveBy}
              onChange={(e) => setArriveBy(e.target.value)}
              aria-label={label === 'home' ? '幾點要到家' : '幾點要到公司'}
              className="mt-2 h-11 w-full rounded-xl bg-surface-3 px-3 text-[16px] outline-none"
            />
            {/*
              * 倒數估太樂觀會讓人錯過會議，所以先講清楚它的不確定性 ——
              * 等車是期望值，國定假日我們判斷不了。
              */}
            <p className="mt-1.5 text-[11px] text-subtle">
              倒數含步行、轉乘與依班距估算的等車（期望值，不是保證），
              並多抓 5 分鐘出門緩衝。國定假日與補班日的班距判斷不了，連假前後請自行多抓時間。
            </p>
          </>
        )}
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
                'hit-area-y h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors',
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
          /*
           * 兩個 time input 並排放不下時改成上下排。
           *
           * 一個 time input 要 142px 才顯示得完「上午 07:30」加時鐘圖示
           * （量出來的值，字級 16px）。兩個加上中間的「至」與卡片內距，
           * 螢幕要 390px 以上才夠 —— iPhone SE 是 375px、mini 是 360px，
           * 都不夠。硬擠的話分鐘會被切掉，變成只看得到「上午 07」。
           *
           * min-w-0 是配套：flex item 的 min-width 預設是 auto（不能縮得比內容窄），
           * 少了它，並排時不是被切掉而是直接撐破卡片跑出畫面。
           * flex-1 只讓它「可以長大」，沒有讓它「可以縮小」。
           */
          <div className="mt-2 flex items-center gap-2 max-[389px]:flex-col max-[389px]:items-stretch">
            <input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              aria-label="通知開始時間"
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-3 px-3 text-[16px] outline-none"
            />
            <span className="text-[13px] text-subtle max-[389px]:text-center">至</span>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              aria-label="通知結束時間"
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-3 px-3 text-[16px] outline-none"
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
  onAddOther,
}: {
  route: CommuteRoute
  transferRequired: boolean
  onDone: () => void
  /** 另一條還沒設定時才給。null = 兩條都有了，不要顯示一個沒事做的按鈕。 */
  onAddOther: (() => void) | null
}) {
  const line = metroLineOf(route)

  return (
    <TransportCard
      chip={ROUTE_LABEL_TEXT[route.label].title}
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
      {/* 有設定抵達時間才講，沒有就不要暗示有倒數這件事 */}
      {route.arriveBy && (
        <p className="text-[13px] text-muted">
          {route.arriveBy} 要到・行程頁會算「再幾分鐘該出門」
        </p>
      )}
      {/* 沒有可查的捷運路線名（公車、或推不出來）就只確認有記下來 */}
      {line ? (
        <TransitStatus line={line} />
      ) : (
        <p className="text-[13px] text-muted">已記下這條路線，之後有異常會通知您。</p>
      )}

      {/*
        * 另一條的入口。
        *
        * 只設了上班那條的話，異常通知只保護早上那一趟 —— 而晚上才是叫車需求的
        * 高峰、末班車問題唯一會發生的時段。所以這個提示值得佔一行。
        */}
      {onAddOther && (
        <button
          type="button"
          onClick={onAddOther}
          className="mt-1 w-full rounded-xl bg-surface-3 py-3 text-[14px] font-semibold text-muted transition-transform active:scale-[.99]"
        >
          {route.label === 'commute' ? '🏠 也設定回家那條' : '💼 也設定上班那條'}
        </button>
      )}
    </TransportCard>
  )
}

export function CommuteSetupScreen() {
  const navigate = useNavigate()
  const { messages, busy, error } = conversation.use()
  const { routes } = useCommuteRoutes()
  /*
   * 這一頁有兩種狀態，由 editing 決定：
   *   editing 有值   正在填某一條（新設、或從確認卡按「也設定另一條」進來）
   *   editing 為 null 顯示確認卡（剛存好的那一條，或既有的那一條）
   *
   * 沒有任何路線時 editing 也會是 null，這時候 confirming 是 undefined，
   * 下面就落到表單那一支 —— 不用再開一個狀態。
   */
  const [editing, setEditing] = useState<RouteLabel | null>(null)
  const [saved, setSaved] = useState<{ label: RouteLabel; transferRequired: boolean } | null>(
    null,
  )

  /* 剛存好的優先；沒存過就顯示上班那條，再沒有就回家那條 */
  const confirming = editing
    ? null
    : ((saved && routes[saved.label]) ?? routes.commute ?? routes.home ?? null)

  const missingLabel = ROUTE_LABELS.find((l) => !routes[l]) ?? null
  const route = confirming
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
              {m.content || (m.cards?.length ? null : <ThinkingDots />)}
              {/* 卡片跟文字是同一則回覆的兩個部分，所以放在同一個氣泡裡 */}
              {m.cards?.map((card, ci) => (
                <AgentCardView key={ci} card={card} onRetry={conversation.retry} />
              ))}
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
            /* 只有這一次剛存好的才講轉乘，讀既有路線時我們不知道 */
            transferRequired={saved?.label === route.label ? saved.transferRequired : false}
            onDone={() => navigate('/trips')}
            onAddOther={missingLabel ? () => setEditing(missingLabel) : null}
          />
        ) : (
          <SetupForm
            initialLabel={editing ?? missingLabel ?? 'commute'}
            onSaved={(label, transferRequired) => {
              setSaved({ label, transferRequired })
              setEditing(null)
            }}
          />
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
