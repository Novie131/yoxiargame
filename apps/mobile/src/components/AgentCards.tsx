import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { AlertIcon, CarIcon, ClockIcon, CrosshairIcon, MapPinIcon, RainIcon, SunIcon } from './icons'
import { AdviceLine } from './MissionSheet'
import type {
  AgentCard,
  InterestChangeCard,
  ItineraryCard,
  LocationRequestCard,
  MissionProgressCard,
  MissionsCard,
  NoticeCard,
  PlacesCard,
  ResultCard,
  RideEstimateCard,
  RoutePlanCard,
  TransitStatusCard,
  TripOptionSummary,
  TripOptionsCard,
  WalkRouteCard,
  WeatherCard,
} from '@/lib/agent'
import { minutesLeft } from '@/lib/communityDay'
import { useCommuteRoutes } from '@/lib/commute'
import { sendMessage, useConversation } from '@/lib/conversation'
import { applyInterestChange, INTERESTS, useInterests } from '@/lib/interests'
import { lookupPlace, requestLocation, setManualLocation, useUserLocation } from '@/lib/location'
import { formatFare, trafficLabel } from '@/lib/ride'
import { describeTripOption, useTripOptions } from '@/lib/tripOptions'
import { addTrip, useTrips } from '@/lib/trips'
import { WALK_ROUTE } from '@/lib/walkRoute'

/*
 * 對話裡的動作卡片。
 *
 * 存在的理由是「講不清楚」或「講完還要做一件事」：
 *   路線規劃 有幾段、在哪換線、還有沒有別條路 —— 排版比一段文字好讀，
 *            而且「其他路線」本來就需要一個可以按的東西
 *   天氣     現況 + 未來幾小時 + 好幾則建議，一句話塞不下
 *   附近任務 一次推一個，下一步是「看怎麼去」，不想去就換下一個
 *   附近店家 同上；營業時間、地址缺的就留白，不補
 *   交通比較 走路／捷運／叫車並排，建議是一行字，不改排序
 *   行程規劃 社群日的任務點排成一條路線，每段標明走路或叫車
 *   任務進度 完成幾站、下一站在哪
 *   路況     正常／異常是二元狀態，用顏色一眼看得出來，異常時能直接找替代方式
 *   興趣調整 改了會影響之後推什麼，所以要使用者按確認才存
 *   執行結果 存好了什麼、去哪裡看 —— 只有一句「好了」的話，使用者不知道存去哪
 *   缺位置   使用者要做的事（開定位、選地點）是動作，不是資訊
 *
 * 視覺沿用 TransportCard 那套（主色淡底、圓角、整寬 CTA），
 * 讓對話裡的卡片跟設計稿裡的交通建議卡看起來是同一種東西。
 *
 * 結構對齊設計稿「10 種 AI 回覆模組」：內容在上，最底下一顆主要動作、
 * 必要時再一個次要動作。但只有**真的有事可做**時才放 —— 設計稿裡每張都有
 * 按鈕是示意，硬湊一顆按不出結果的按鈕比沒有更糟。
 */

/* 卡片底部的主要動作。整寬、主色，一張卡片最多一顆。 */
function PrimaryAction({
  children,
  onClick,
  disabled,
  done,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  /* 動作已經完成（例如已加入行程）—— 改成灰底，跟「暫時不能按」區分開 */
  done?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || done}
      className="mt-3 w-full rounded-lg py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98] disabled:active:scale-100"
      style={
        done
          ? { background: 'var(--color-surface)', color: 'var(--color-muted)' }
          : {
              background: 'var(--color-primary)',
              color: '#fff',
              opacity: disabled ? 0.6 : 1,
            }
      }
    >
      {children}
    </button>
  )
}

/* 主要動作下面的文字連結。給「不是首選、但常常需要」的另一條路。 */
function SecondaryAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-1 w-full py-1.5 text-[13px] font-semibold text-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/*
 * 讓卡片上的按鈕替使用者問下一句。
 *
 * 回答中途按的話會被 send 擋掉、什麼事都沒發生 —— 所以按鈕要跟著停用，
 * 不然看起來像壞掉。
 */
function useAsk() {
  const { busy } = useConversation()
  return { ask: (text: string) => void sendMessage(text), busy }
}

const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} 公里` : `${m} 公尺`

/* 「剩 2 小時」「剩 40 分」。已結束或沒有期限時回 null，就不顯示。 */
function timeLeftLabel(endsAt: string | null | undefined): string | null {
  const left = minutesLeft(endsAt ?? null)
  if (left === null) return null
  return left >= 60 ? `剩 ${Math.floor(left / 60)} 小時` : `剩 ${left} 分`
}

/* 卡片最上面那一行小字：這張卡在講什麼、目前是第幾個 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-semibold text-primary">{children}</p>
}

/* 數字怎麼來的。跟 ride.ts 的 basis 同一個用意：要跟數字一起被看到，不要拿掉。 */
function Basis({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[11px] leading-[1.6] text-subtle">{children}</p>
}

/* 打開探索頁上那個任務的面板。面板會依實際時間比較走路、捷運、叫車。 */
function useOpenMission() {
  const navigate = useNavigate()
  return (m: { id: string; lat: number; lon: number }) => {
    const params = new URLSearchParams({ mission: m.id, lat: String(m.lat), lon: String(m.lon) })
    navigate(`/explore?${params}`)
  }
}

function Shell({
  tone = 'primary',
  children,
}: {
  tone?: 'primary' | 'warning'
  children: React.ReactNode
}) {
  return (
    <div
      className="mt-3 rounded-xl border p-3"
      style={
        tone === 'warning'
          ? {
              borderColor: 'var(--color-banner-warm-ink)',
              background: 'var(--color-warning-tint)',
            }
          : {
              borderColor: 'var(--color-primary-muted)',
              background: 'var(--color-primary-tint)',
            }
      }
    >
      {children}
    </div>
  )
}

function RoutePlan({ card }: { card: RoutePlanCard }) {
  /*
   * 預設選第一條（建議路線）。切換只影響這張卡片，不回頭問模型 ——
   * 所有路線都已經在同一次工具呼叫裡算好了。
   */
  const [selected, setSelected] = useState(0)
  const route = card.routes[selected] ?? card.routes[0]
  const hasChoices = card.routes.length > 1

  /*
   * 訂閱行程，這樣按下去之後按鈕會立刻變成「已加入」——
   * 只用本地 state 的話，同一組起訖在別張卡片上加過了，這裡還是顯示沒加。
   */
  const trips = useTrips()
  const added = trips.some(
    (t) => t.fromStation === card.fromStation && t.toStation === card.toStation,
  )

  return (
    <Shell>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-[15px] font-bold">
          {card.from} → {card.to}
        </h3>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary">
          <ClockIcon />約 {route.totalMinutes} 分
        </span>
      </div>

      <p className="mt-1 text-[12px] text-muted">
        {route.transfers > 0 ? `轉乘 ${route.transfers} 次` : '直達'}
        {/* 走路與等車都是門到門時間的一部分，要看得到，不然數字對不起來 */}
        {card.fromWalkMinutes > 0 && `・走 ${card.fromWalkMinutes} 分到${card.fromStation}`}
        {route.waitMinutes > 0 && `・等車約 ${route.waitMinutes} 分`}
        {card.toWalkMinutes > 0 && `・出站走 ${card.toWalkMinutes} 分`}
        {card.peak && '・尖峰'}
      </p>

      {/*
        * 收班警告。
        *
        * 這張卡片最重要的一行 —— 沒有它的話，凌晨兩點的使用者會看到一條
        * 「約 6 分鐘」的漂亮路線，然後走到站門口才發現捷運關了。
        * 所以放在路線清單**之前**，而且用警示色，不能讓人滑過去。
        */}
      {card.service.status === 'closed' && (
        <div
          className="mt-2.5 rounded-lg px-3 py-2"
          style={{ background: 'var(--color-warning-tint)' }}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <AlertIcon />
            捷運目前沒有營運
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {card.service.station}
            {card.service.line} 末班 {card.service.lastTrain}、首班 {card.service.firstTrain}。
            下面的時間僅供參考，現在搭不到。
          </p>
        </div>
      )}

      {/*
        * 其他路線。只有真的有第二條時才出現 ——
        * 永遠顯示一顆孤單的「建議」按鈕，只會讓人以為有東西可以按卻按不動。
        */}
      {hasChoices && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.routes.map((option, i) => {
            const active = i === selected
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={active}
                className="rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors"
                style={{
                  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: active ? '#fff' : 'var(--color-muted)',
                }}
              >
                {i === 0 ? '建議' : `路線 ${i + 1}`} {option.totalMinutes} 分
                {option.transfers === 0 ? '・直達' : `・轉 ${option.transfers}`}
                {option.service === 'closed' && '・已收班'}
              </button>
            )
          })}
        </div>
      )}

      <ol className="relative mt-2.5 space-y-2.5">
        {/* 段落之間的連接線，跟行程頁的常用路線卡同一個語彙 */}
        {route.legs.length > 1 && (
          <span className="absolute left-[4.5px] top-3 bottom-3 w-px bg-line" />
        )}
        {route.legs.map((leg, i) => (
          <li key={`${leg.line}-${i}`} className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <div className="-mt-0.5 min-w-0">
              <p className="text-[14px] font-semibold">{leg.line}</p>
              <p className="text-[12px] text-muted">
                {leg.from} → {leg.to}・{leg.stops} 站・{leg.minutes} 分
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* 時間的組成要講清楚，不要讓使用者以為是保證值 */}
      <p className="mt-2.5 text-[11px] text-subtle">
        {route.waitMinutes > 0
          ? '等車依班距估算，是期望值不是保證；步行時間由直線距離估算。'
          : '時間為估計；步行時間由直線距離估算。'}
      </p>

      {/*
        * 加入行程是**明示**的動作，不是我們替他決定的。
        *
        * 「幫我安排西門町到北車」很可能只是在問路，不代表他要把它記下來；
        * 猜錯就是往他每天早上會看的那一頁塞垃圾。但他已經在上面的藥丸裡
        * 選好了要哪一條，所以這裡只是把那個選擇收下來，一下就好。
        *
        * 收班的路線不給加 —— 現在搭不到的東西放進今天的行程沒有意義。
        */}
      {card.service.status !== 'closed' && (
        <PrimaryAction
          done={added}
          onClick={() =>
            addTrip({
              from: card.from,
              to: card.to,
              fromStation: card.fromStation,
              toStation: card.toStation,
              lines: route.legs.map((l) => l.line),
              transfers: route.transfers,
              totalMinutes: route.totalMinutes,
            })
          }
        >
          {added ? '已加入今天行程' : '加入今天行程'}
        </PrimaryAction>
      )}
    </Shell>
  )
}

/* 提醒的種類 → 圖示。沒對到的（穿著、溫差）用小圓點就好，不要硬湊一個圖。 */
function AdviceIcon({ kind }: { kind: string }) {
  if (kind === 'umbrella') return <RainIcon />
  if (kind === 'uv' || kind === 'heat') return <SunIcon />
  if (kind === 'cold') return <AlertIcon />
  return <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-primary" />
}

/* 一次最多顯示幾則提醒。全部倒出來會變成一張讀不完的清單。 */
const MAX_ADVICES = 3

/*
 * 看完天氣，下一個問題幾乎都是「那我等一下怎麼去」。
 *
 * 只對存過的通勤路線問 —— 沒存的話我們不知道他要去哪，
 * 送一句「去公司怎麼走」出去只會換來模型反問公司在哪。
 * 下午之後問回家那條，早上問上班那條；只存一條就用那一條。
 */
const AFTERNOON_HOUR = 14

function useCommuteQuestion() {
  const { routes } = useCommuteRoutes()
  const preferHome = new Date().getHours() >= AFTERNOON_HOUR
  const route = preferHome
    ? (routes.home ?? routes.commute)
    : (routes.commute ?? routes.home)
  if (!route) return null

  return {
    label: route.label === 'home' ? '查看回家的交通' : '查看去公司的交通',
    question: `從${route.origin}到${route.destination}，現在怎麼去比較好？`,
  }
}

function Weather({ card }: { card: WeatherCard }) {
  const { ask, busy } = useAsk()
  const commute = useCommuteQuestion()

  return (
    <Shell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold">{card.place}</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            {card.condition}
            {card.uvIndex > 0 && `・紫外線 ${card.uvIndex}（${card.uvLevel}）`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[22px] font-bold leading-none">{card.temperatureC}°</p>
          <p className="mt-1 text-[11px] text-subtle">體感 {card.feelsLikeC}°</p>
        </div>
      </div>

      {/* 未來幾小時。「等一下要不要帶傘」的答案就在這一行。 */}
      {card.outlook && (
        <p className="mt-2 border-t pt-2 text-[12px] text-muted" style={{ borderColor: 'var(--color-primary-muted)' }}>
          接下來 {card.outlook.hours} 小時 {card.outlook.minTemperatureC}–
          {card.outlook.maxTemperatureC}°
          {card.outlook.maxPrecipitationProbability > 0 &&
            `・降雨機率 ${card.outlook.maxPrecipitationProbability}%`}
          {card.outlook.rainStartsAt && `（約 ${card.outlook.rainStartsAt} 起）`}
        </p>
      )}

      {card.advices.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {card.advices.slice(0, MAX_ADVICES).map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0"><AdviceIcon kind={a.kind} /></span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">{a.title}</p>
                {a.body && <p className="text-[12px] text-muted">{a.body}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {commute && (
        <PrimaryAction disabled={busy} onClick={() => ask(commute.question)}>
          {commute.label}
        </PrimaryAction>
      )}
    </Shell>
  )
}

/*
 * 缺位置。
 *
 * 兩條路都要給：開定位（他可能只是還沒授權）與手動輸入（他可能就是不想給）。
 * 只給前者的話，拒絕過權限的人會卡死在這裡 —— 瀏覽器不會再問第二次，
 * 而叫他自己去系統設定裡找是最差的體驗。
 *
 * 設定好之後直接用同一句話重問一次（onRetry），不要要求他再打一遍。
 */
function LocationRequest({
  card,
  onRetry,
}: {
  card: LocationRequestCard
  onRetry?: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enableGps = async () => {
    setBusy(true)
    setError(null)
    try {
      const location = await requestLocation()
      if (location.source === 'gps') onRetry?.()
      else setError('還是拿不到定位，可以改用下面的方式指定地點')
    } finally {
      setBusy(false)
    }
  }

  const applyTypedPlace = async () => {
    const q = query.trim()
    if (!q || busy) return

    setBusy(true)
    setError(null)
    try {
      const place = await lookupPlace(q)
      if (!place) {
        setError(`查不到「${q}」，換個說法試試（例如「信義區」「板橋站」）`)
        return
      }
      setManualLocation(place.lat, place.lon, place.name)
      onRetry?.()
    } catch {
      setError('地點查詢暫時無法使用')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell tone="warning">
      <h3 className="text-[15px] font-bold">{card.message}</h3>

      <button
        type="button"
        onClick={enableGps}
        disabled={busy}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-60"
      >
        <CrosshairIcon />
        開啟定位
      </button>

      <p className="mt-3 text-[12px] text-muted">或直接告訴我你在哪</p>

      <div className="mt-1.5 flex gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void applyTypedPlace()
          }}
          placeholder="信義區、板橋站、臺北101…"
          aria-label="手動輸入目前位置"
          className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 text-[16px] outline-none"
        />
        <button
          type="button"
          onClick={applyTypedPlace}
          disabled={busy || !query.trim()}
          className="shrink-0 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-40"
        >
          使用
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] text-primary">{error}</p>}
    </Shell>
  )
}

/*
 * 附近任務（模組 03）。
 *
 * 一次只推一個，不是一整串清單 —— 清單要使用者自己比較、自己挑，
 * 而他問「附近有什麼好玩的」就是不想自己挑。不喜歡就按「看其他任務」換下一個，
 * 那些都已經在同一次工具呼叫裡查好了，不用再問一次模型。
 *
 * 主要動作導到探索頁的任務面板，而不是直接進叫車。
 * 那個面板會依實際時間比較走路、捷運、叫車，讓使用者自己選；
 * 這裡直接推叫車的話，三百公尺的任務也會叫車，那是在推銷。
 */
function Missions({ card }: { card: MissionsCard }) {
  const [index, setIndex] = useState(0)
  const openMission = useOpenMission()
  const m = card.missions[index] ?? card.missions[0]
  const total = card.missions.length
  const left = timeLeftLabel(m.endsAt)

  return (
    <Shell>
      <Eyebrow>
        {card.area ? `${card.area}附近的任務` : '附近的任務'}
        {total > 1 && `・${index + 1}／${total}`}
      </Eyebrow>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-[16px] font-bold">{m.name}</h3>
        {/* 距離是相對於查詢的地區，上面那行已經寫明是哪一區 */}
        <span className="shrink-0 text-[12px] text-muted">
          {formatDistance(m.distanceFromAreaMeters)}
        </span>
      </div>

      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
        <MapPinIcon />
        {m.campaign}
        {left && `・${left}`}
      </p>

      {m.completed && (
        <p className="mt-2 text-[13px] font-semibold text-success">✓ 你已經完成這個任務</p>
      )}

      <PrimaryAction onClick={() => openMission(m)}>
        {m.completed ? '看任務內容' : '看怎麼去'}
      </PrimaryAction>
      {total > 1 && (
        <SecondaryAction onClick={() => setIndex((index + 1) % total)}>看其他任務</SecondaryAction>
      )}
    </Shell>
  )
}

/*
 * 從目前位置到某個座標，走路／捷運／叫車並排比較。
 *
 * 店家卡用它，不是叫模型再查一次：店名丟給地理編碼會出事 ——
 * 「星巴克」可能被解析到另一家分店，然後整條路線都是錯的。
 * 座標在卡片上就有，直接拿座標算最準。
 *
 * 退路座標（信義區）不算數 —— 從一個使用者不在的地方算出來的時間沒有意義。
 */
function TripCompare({ to }: { to: { name: string; lat: number; lon: number } }) {
  const navigate = useNavigate()
  const location = useUserLocation()
  const known = location.source !== 'fallback'
  const origin = useMemo(
    () => (known ? { lat: location.lat, lon: location.lon } : null),
    [known, location.lat, location.lon],
  )
  const target = useMemo(() => ({ lat: to.lat, lon: to.lon }), [to.lat, to.lon])
  const trip = useTripOptions(origin, target)

  if (!origin) {
    return <p className="mt-2.5 text-[13px] text-muted">需要知道你在哪，才比較得了怎麼去。</p>
  }
  if (trip.status === 'loading') return <p className="mt-2.5 text-[13px] text-muted">計算中…</p>
  if (trip.status === 'error') {
    return <p className="mt-2.5 text-[13px] text-muted">交通選項暫時取不到。</p>
  }
  if (trip.data.arrived) {
    return <p className="mt-2.5 text-[13px] font-semibold text-success">你已經在附近了</p>
  }

  const goRide = () => {
    const params = new URLSearchParams({
      to: to.name,
      toLat: String(to.lat),
      toLon: String(to.lon),
    })
    navigate(`/ride/estimate?${params}`)
  }

  return (
    <>
      {/* 建議在清單上方，但清單順序不受它影響 —— 跟任務面板同一條規則 */}
      {trip.data.advice && <AdviceLine advice={trip.data.advice} />}
      <ul className="mt-2 space-y-1.5">
        {trip.data.options.map((o, i) => (
          <OptionRow
            key={o.mode}
            fastest={i === 0}
            {...describeTripOption(o)}
            onRide={o.mode === 'ride' ? goRide : undefined}
          />
        ))}
      </ul>
    </>
  )
}

/* 交通選項的一列。只有叫車那列按得下去 —— 走路跟捷運沒有可以接手的畫面。 */
function OptionRow({
  title,
  detail,
  fastest,
  onRide,
}: {
  title: string
  detail: string
  fastest: boolean
  onRide?: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onRide}
        disabled={!onRide}
        className={[
          'w-full rounded-lg px-3 py-2 text-left',
          /* 第一個是實際最快的，給它視覺重量 —— 但那不一定是叫車 */
          fastest ? 'bg-surface' : 'bg-surface/60',
          onRide ? 'active:scale-[.99]' : 'disabled:opacity-100',
        ].join(' ')}
      >
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          {onRide && <CarIcon />}
          {title}
          {fastest && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
              最快
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted">{detail}</span>
      </button>
    </li>
  )
}

/*
 * 附近店家（模組 02）。跟任務卡同一個節奏：一次一家，不喜歡就換。
 *
 * 沒有圖。設計稿有一張店家照片，但 OpenStreetMap 沒有圖片 ——
 * 放一張示意圖會讓人以為那就是那家店。
 */
function Places({ card }: { card: PlacesCard }) {
  const [index, setIndex] = useState(0)
  const [comparing, setComparing] = useState(false)
  const location = useUserLocation()
  const place = card.places[index] ?? card.places[0]
  const total = card.places.length

  return (
    <Shell>
      <Eyebrow>
        {card.area ? `${card.area}附近的${card.categoryLabel}` : `附近的${card.categoryLabel}`}
        {total > 1 && `・${index + 1}／${total}`}
      </Eyebrow>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-[16px] font-bold">{place.name}</h3>
        <span className="shrink-0 text-[12px] text-muted">
          {formatDistance(place.distanceMeters)}
        </span>
      </div>

      {/* 沒有的就不顯示，不放「營業時間：未提供」—— 那一行沒有幫助 */}
      {place.openingHours && (
        <p className="mt-1 flex items-start gap-1 text-[12px] text-muted">
          <span className="mt-px shrink-0"><ClockIcon /></span>
          {place.openingHours}
        </p>
      )}
      {place.address && (
        <p className="mt-0.5 flex items-start gap-1 text-[12px] text-muted">
          <span className="mt-px shrink-0"><MapPinIcon /></span>
          {place.address}
        </p>
      )}

      {comparing && <TripCompare to={place} />}

      <Basis>{card.basis}</Basis>

      {!comparing && location.source !== 'fallback' && (
        <PrimaryAction onClick={() => setComparing(true)}>比較怎麼去</PrimaryAction>
      )}
      {total > 1 && (
        <SecondaryAction
          onClick={() => {
            setIndex((index + 1) % total)
            setComparing(false)
          }}
        >
          換一個推薦
        </SecondaryAction>
      )}
    </Shell>
  )
}

function summaryLabel(o: TripOptionSummary): { title: string; detail: string } {
  if (o.mode === 'walk') {
    return { title: `步行 ${o.minutes} 分鐘`, detail: `約 ${formatDistance(o.distanceMeters)}` }
  }
  if (o.mode === 'metro') {
    return {
      title: `搭捷運 約 ${o.minutes} 分鐘${o.fareTwd !== null ? `・NT$${o.fareTwd}` : ''}`,
      detail:
        `${o.fromStation} → ${o.toStation}` +
        (o.lines.length > 0 ? `・${o.lines.join(' → ')}` : '') +
        (o.transfers > 0 ? `・轉乘 ${o.transfers} 次` : ''),
    }
  }
  /* 車資的依據要跟數字放在一起，理由同叫車估價卡 */
  return { title: `叫車 約 ${o.minutes} 分鐘`, detail: `${formatFare(o.fare)}・${o.basis}` }
}

/*
 * 交通方式比較（模組 04）。
 *
 * 排序照後端算的實際時間，畫面不重排；建議是上方一行字，說得出「別叫車」。
 * 主要動作跟著選項走：有捷運就問怎麼搭（換線細節這張卡沒有），
 * 叫車那一列本身就按得下去，不用再多一顆按鈕。
 */
function TripOptions({ card }: { card: TripOptionsCard }) {
  const navigate = useNavigate()
  const { ask, busy } = useAsk()
  const hasCoords = card.toLat !== 0 && card.toLon !== 0
  const hasMetro = card.options.some((o) => o.mode === 'metro')

  const goRide = () => {
    const params = new URLSearchParams({
      to: card.to,
      toLat: String(card.toLat),
      toLon: String(card.toLon),
    })
    navigate(`/ride/estimate?${params}`)
  }

  return (
    <Shell>
      <h3 className="min-w-0 truncate text-[15px] font-bold">
        {card.from} → {card.to}
      </h3>

      {card.advice && <AdviceLine advice={card.advice} />}

      <ul className="mt-2 space-y-1.5">
        {card.options.map((o, i) => (
          <OptionRow
            key={o.mode}
            fastest={i === 0}
            {...summaryLabel(o)}
            onRide={o.mode === 'ride' && hasCoords ? goRide : undefined}
          />
        ))}
      </ul>

      {card.basis && <Basis>{card.basis}</Basis>}

      {hasMetro && (
        <PrimaryAction
          disabled={busy}
          onClick={() =>
            ask(
              card.fromIsHere
                ? `從我這裡到${card.to}的捷運要怎麼搭？`
                : `從${card.from}到${card.to}的捷運要怎麼搭？`,
            )
          }
        >
          看捷運怎麼搭
        </PrimaryAction>
      )}
    </Shell>
  )
}

/*
 * 社群日行程（模組 06）。版面沿用探索頁的 CommunityDayCard，
 * 「不是每段都給車資」「熱度不講成可共乘的人」那幾條規則也一樣。
 */
function Itinerary({ card }: { card: ItineraryCard }) {
  const openMission = useOpenMission()
  const left = timeLeftLabel(card.endsAt)
  const first = card.legs[0]

  return (
    <Shell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>社群日行程</Eyebrow>
          <h3 className="mt-0.5 truncate text-[16px] font-bold">{card.campaign}</h3>
        </div>
        {left && (
          <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-primary">
            {left}
          </span>
        )}
      </div>

      <p className="mt-1 text-[12px] text-muted">
        {card.completed > 0 && `已完成 ${card.completed} 個・`}
        還有 {card.remaining} 個點
        {card.totalWalkMinutes > 0 && `・步行約 ${card.totalWalkMinutes} 分`}
      </p>

      <ol className="mt-2.5 space-y-1.5">
        {card.legs.map((leg) => (
          <li key={leg.missionId}>
            <button
              type="button"
              onClick={() => openMission({ id: leg.missionId, lat: leg.lat, lon: leg.lon })}
              className="flex w-full items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-left transition-transform active:scale-[.99]"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                {leg.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{leg.name}</span>
                <span className="block text-[12px] text-muted">
                  {leg.mode === 'walk'
                    ? `走 ${leg.walkMinutes} 分・${formatDistance(leg.distanceMeters)}`
                    : /* 建議叫車時，走路要幾分鐘也一起講 —— 只給車資會變成「你只能叫車」 */
                      `建議叫車${leg.rideFare ? ` ${formatFare(leg.rideFare)}` : ''}` +
                      `${leg.rideMinutes !== null ? `・${leg.rideMinutes} 分` : ''}` +
                      `（走路要 ${leg.walkMinutes} 分）`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <Basis>
        {card.basis}
        {card.rideBasis && `。${card.rideBasis}`}
      </Basis>

      {first && (
        <PrimaryAction
          onClick={() => openMission({ id: first.missionId, lat: first.lat, lon: first.lon })}
        >
          從第 1 站出發
        </PrimaryAction>
      )}
    </Shell>
  )
}

/*
 * 社群日任務進度（模組 08）。
 *
 * 設計稿上有一行獎勵，這裡刻意沒有：資料庫裡沒有任何獎勵或點數的資料，
 * 寫一個出來就是使用者會跑去兌換、然後兌換不到的東西。
 */
function MissionProgress({ card }: { card: MissionProgressCard }) {
  const openMission = useOpenMission()
  const left = timeLeftLabel(card.endsAt)
  const percent = Math.round((card.completed / card.total) * 100)
  const done = card.completed >= card.total

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow>任務進度{left && `・${left}`}</Eyebrow>
          <h3 className="mt-0.5 truncate text-[16px] font-bold">{card.campaign}</h3>
        </div>
        <span className="shrink-0 text-[15px] font-bold text-primary">
          {card.completed}／{card.total}
        </span>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={card.total}
        aria-valuenow={card.completed}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {card.stops.map((stop, i) => (
          <li
            key={`${stop.name}-${i}`}
            className="rounded-full px-2.5 py-1 text-[12px]"
            style={
              stop.completed
                ? { background: 'var(--color-success-tint)', color: 'var(--color-success)' }
                : { background: 'var(--color-surface)', color: 'var(--color-muted)' }
            }
          >
            {stop.completed && '✓ '}
            {stop.name}
          </li>
        ))}
      </ul>

      {done ? (
        <p className="mt-3 text-[13px] font-semibold text-success">✓ 這場活動你跑完了</p>
      ) : (
        card.next && (
          <>
            <p className="mt-3 text-[12px] text-muted">
              下一站：{card.next.name}・{formatDistance(card.next.distanceMeters)}
            </p>
            <PrimaryAction
              onClick={() =>
                card.next &&
                openMission({ id: card.next.missionId, lat: card.next.lat, lon: card.next.lon })
              }
            >
              前往下一站
            </PrimaryAction>
          </>
        )
      )}
    </Shell>
  )
}

const interestLabel = (id: string) => INTERESTS.find((i) => i.id === id)?.label ?? id

/*
 * 興趣調整的確認（模組 09）。
 *
 * 興趣決定了之後主動推給他什麼，猜錯的代價是一整天的錯誤推播 ——
 * 所以模型只能提議，按下確認才寫進去。「先不要」也是一個正常的答案。
 *
 * 狀態看的是實際的興趣，不是這張卡自己記的：在設定頁改過之後
 * 回來看，這張卡要照實反映「已經是這樣了」。
 */
function InterestChange({ card }: { card: InterestChangeCard }) {
  const { selected } = useInterests()
  const [declined, setDeclined] = useState(false)
  const applied =
    card.add.every((id) => selected.includes(id)) &&
    card.remove.every((id) => !selected.includes(id))

  const after = [
    ...selected.filter((id) => !card.remove.includes(id)),
    ...card.add.filter((id) => !selected.includes(id)),
  ]

  return (
    <Shell>
      <Eyebrow>調整興趣偏好</Eyebrow>

      <ul className="mt-1.5 space-y-1 text-[14px]">
        {card.add.map((id) => (
          <li key={`add-${id}`} className="font-semibold">＋ {interestLabel(id)}</li>
        ))}
        {card.remove.map((id) => (
          <li key={`remove-${id}`} className="font-semibold text-muted line-through">
            {interestLabel(id)}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[12px] text-muted">
        調整後：{after.length > 0 ? after.map(interestLabel).join('、') : '不篩選，全部都推'}
      </p>

      {applied ? (
        <PrimaryAction done onClick={() => {}}>已儲存</PrimaryAction>
      ) : declined ? (
        <p className="mt-3 text-[13px] text-muted">好，維持原本的設定。</p>
      ) : (
        <>
          <PrimaryAction onClick={() => applyInterestChange(card.add, card.remove)}>
            確認儲存
          </PrimaryAction>
          <SecondaryAction onClick={() => setDeclined(true)}>先不要</SecondaryAction>
        </>
      )}
    </Shell>
  )
}

/*
 * 執行結果（模組 10）。
 *
 * 狀態本身早就由 planned_trip / commute_route 事件更新了 ——
 * 這張卡是讓使用者看得到存了什麼，並且一下就能去看或改。
 */
function Result({ card }: { card: ResultCard }) {
  const navigate = useNavigate()
  const target = card.subject === 'trip' ? '/trips' : '/commute-setup'

  return (
    <Shell>
      <p className="flex items-center gap-1.5 text-[15px] font-bold text-success">✓ {card.title}</p>
      <p className="mt-0.5 text-[13px] text-muted">{card.detail}</p>
      <PrimaryAction onClick={() => navigate(target)}>
        {card.subject === 'trip' ? '查看今天行程' : '查看通勤設定'}
      </PrimaryAction>
    </Shell>
  )
}

/*
 * 散步路線（Figma 05A 的 02A：附近散步卡 → 05C 路線詳情）。
 * 只有一條示範路線，不認得的 id 就不畫，不要畫一張點進去是別條的卡。
 */
function WalkRoute({ card }: { card: WalkRouteCard }) {
  const navigate = useNavigate()
  if (card.routeId !== WALK_ROUTE.id) return null

  return (
    <Shell>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-primary px-2 py-0.5 text-[11px] font-bold text-primary">
          附近散步
        </span>
        <span className="text-[12px] font-bold text-primary">輕鬆慢走</span>
      </div>
      <h3 className="mt-2 text-[15px] font-bold">{WALK_ROUTE.title}（示範路線）</h3>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
        <span className="flex items-center gap-1">
          <ClockIcon />約 {WALK_ROUTE.minutes} 分鐘
        </span>
        <span className="flex items-center gap-1">
          <MapPinIcon />約 {WALK_ROUTE.distanceKm} 公里・{WALK_ROUTE.spots} 個景點
        </span>
      </p>
      <p className="mt-1 text-[12px] text-subtle">起點：{WALK_ROUTE.start.label}</p>
      <PrimaryAction onClick={() => navigate(WALK_ROUTE.path)}>查看散步路線</PrimaryAction>
    </Shell>
  )
}

/*
 * 叫車估價。
 *
 * 版面的重點順序刻意是「車資 → 依據 → 動作」：
 * basis 那一行緊跟在數字下面，不能移到卡片最底下當小字 ——
 * 它要跟數字一起被讀到，不是讀完才補充。
 */
function RideEstimate({ card }: { card: RideEstimateCard }) {
  const navigate = useNavigate()
  const hasCoords = card.toLat !== 0 && card.toLon !== 0

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-[15px] font-bold">
          {card.from} → {card.to}
        </h3>
        <span className="shrink-0 text-[12px] text-muted">{trafficLabel(card.traffic)}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-[20px] font-bold text-primary">{formatFare(card.fare)}</p>
        <p className="text-[13px] text-muted">
          約 {card.durationMinutes} 分鐘・{card.distanceKm} 公里
          {card.eta && `・${card.eta} 抵達`}
        </p>
      </div>

      <p className="mt-1 text-[12px] text-subtle">
        {card.basis}
        {card.nightSurcharge && '（含夜間加成）'}
      </p>

      {hasCoords && (
        <PrimaryAction
          onClick={() => {
            const params = new URLSearchParams({
              to: card.to,
              toLat: String(card.toLat),
              toLon: String(card.toLon),
            })
            navigate(`/ride/booking?${params}`)
          }}
        >
          叫車前往
        </PrimaryAction>
      )}
    </Shell>
  )
}

function TransitStatus({ card }: { card: TransitStatusCard }) {
  const alert = card.status === 'alert'
  const navigate = useNavigate()
  const { ask, busy } = useAsk()
  const { list } = useCommuteRoutes()

  /*
   * 異常時的下一步：找替代方式。
   *
   * 如果這條線就是他的通勤路線，把起訖一起帶上 —— 模型才查得了替代路線，
   * 不然只會反問「你要從哪裡到哪裡」。不是的話就只講線名，讓模型自己問。
   */
  const affected = list.find((r) => r.line === card.line)
  const alternativeQuestion = affected
    ? `${card.line}有狀況，從${affected.origin}到${affected.destination}有什麼替代方式？`
    : `${card.line}有狀況，有什麼替代方式？`

  return (
    <Shell tone={alert ? 'warning' : 'primary'}>
      <div className="flex items-center gap-2">
        {alert && <AlertIcon />}
        <h3 className="text-[15px] font-bold">{card.line}</h3>
        <span
          className="text-[13px] font-semibold"
          style={{
            color: alert ? 'var(--color-banner-warm-ink)' : 'var(--color-success)',
          }}
        >
          {alert ? '有事件通報' : '目前正常營運'}
        </span>
      </div>

      {card.incidents.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[13px] text-muted">
          {card.incidents.map((i, idx) => (
            <li key={`${i.title}-${idx}`}>・{i.description || i.title}</li>
          ))}
        </ul>
      ) : (
        card.note && <p className="mt-1.5 text-[13px] text-muted">{card.note}</p>
      )}

      {/* 正常營運時沒有下一步可做，不放按鈕 */}
      {alert && (
        <>
          <PrimaryAction disabled={busy} onClick={() => ask(alternativeQuestion)}>
            幫我找替代方式
          </PrimaryAction>
          {/* 趕時間的人不想再等一輪對話，直接給叫車的路 */}
          <SecondaryAction onClick={() => navigate('/ride/booking')}>直接叫車</SecondaryAction>
        </>
      )}
    </Shell>
  )
}

/*
 * 工具查不到東西。
 *
 * 刻意做得樸素但明確 —— 它的工作是在模型講了一段編出來的路線時，
 * 讓使用者至少看得到「這次其實沒查到」。實測發生過：TDX 額度用完，
 * 模型照樣描述了一條不存在的轉乘路線。
 */
function Notice({ card }: { card: NoticeCard }) {
  return (
    <Shell tone="warning">
      <p className="flex items-start gap-1.5 text-[13px]">
        <span className="mt-0.5 shrink-0">
          <AlertIcon />
        </span>
        {card.message}
      </p>
    </Shell>
  )
}

export function AgentCardView({
  card,
  /* 缺位置的卡片設定好之後要重問一次，其他卡片用不到 */
  onRetry,
}: {
  card: AgentCard
  onRetry?: () => void
}) {
  if (card.kind === 'route_plan') return <RoutePlan card={card} />
  if (card.kind === 'weather') return <Weather card={card} />
  if (card.kind === 'location_request') return <LocationRequest card={card} onRetry={onRetry} />
  if (card.kind === 'missions') return <Missions card={card} />
  if (card.kind === 'notice') return <Notice card={card} />
  if (card.kind === 'ride_estimate') return <RideEstimate card={card} />
  if (card.kind === 'places') return <Places card={card} />
  if (card.kind === 'trip_options') return <TripOptions card={card} />
  if (card.kind === 'itinerary') return <Itinerary card={card} />
  if (card.kind === 'mission_progress') return <MissionProgress card={card} />
  if (card.kind === 'interest_change') return <InterestChange card={card} />
  if (card.kind === 'result') return <Result card={card} />
  if (card.kind === 'walk_route') return <WalkRoute card={card} />
  return <TransitStatus card={card} />
}
