import { useState } from 'react'
import { useNavigate } from 'react-router'

import { AlertIcon, ClockIcon, CrosshairIcon, MapPinIcon, RainIcon, SunIcon } from './icons'
import type {
  AgentCard,
  LocationRequestCard,
  MissionsCard,
  RoutePlanCard,
  TransitStatusCard,
  WeatherCard,
} from '@/lib/agent'
import { lookupPlace, requestLocation, setManualLocation } from '@/lib/location'

/*
 * 對話裡的動作卡片。
 *
 * 存在的理由是「講不清楚」或「講完還要做一件事」：
 *   路線規劃 有幾段、在哪換線、還有沒有別條路 —— 排版比一段文字好讀，
 *            而且「其他路線」本來就需要一個可以按的東西
 *   天氣     現況 + 未來幾小時 + 好幾則建議，一句話塞不下
 *   附近任務 使用者接下來要決定去哪一個，卡片上可以直接叫車
 *   路況     正常／異常是二元狀態，用顏色一眼看得出來，異常時能直接改叫車
 *   缺位置   使用者要做的事（開定位、選地點）是動作，不是資訊
 *
 * 通勤路線刻意沒有卡片：用一句話就講得完，做成卡片只是裝飾。
 *
 * 視覺沿用 TransportCard 那套（主色淡底、圓角、整寬 CTA），
 * 讓對話裡的卡片跟設計稿裡的交通建議卡看起來是同一種東西。
 */

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
        {/* 走路時間是門到門時間的一部分，要看得到，不然數字對不起來 */}
        {card.fromWalkMinutes > 0 && `・走 ${card.fromWalkMinutes} 分到${card.fromStation}`}
        {card.toWalkMinutes > 0 && `・出站走 ${card.toWalkMinutes} 分`}
      </p>

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
        時間為估計，不含等第一班車；步行時間由直線距離估算。
      </p>
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

function Weather({ card }: { card: WeatherCard }) {
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
          placeholder="信義區、板橋站、台北 101…"
          aria-label="手動輸入目前位置"
          className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 text-[14px] outline-none"
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

function Missions({ card }: { card: MissionsCard }) {
  const navigate = useNavigate()

  const distance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)} 公里` : `${m} 公尺`

  return (
    <Shell>
      <h3 className="text-[15px] font-bold">
        {card.area ? `${card.area}附近的任務` : '附近的任務'}
      </h3>

      <ul className="mt-2 space-y-2">
        {card.missions.map((m) => (
          <li
            key={m.id}
            className="rounded-lg bg-surface px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[14px] font-semibold">{m.name}</p>
              {/* 距離是相對於查詢的地區，標題已經寫明是哪一區 */}
              <span className="shrink-0 text-[12px] text-muted">
                {distance(m.distanceFromAreaMeters)}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-subtle">
              <MapPinIcon />
              {m.campaign}
            </p>

            {/*
              * 導到探索頁的任務面板，而不是直接進叫車。
              * 那個面板會依實際時間比較走路、捷運、叫車，讓使用者自己選；
              * 這裡直接推叫車的話，三百公尺的任務也會叫車，那是在推銷。
              */}
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams({
                  mission: m.id,
                  lat: String(m.lat),
                  lon: String(m.lon),
                })
                navigate(`/explore?${params}`)
              }}
              className="mt-2 w-full rounded-lg bg-primary py-2 text-[13px] font-semibold text-white transition-transform active:scale-[.98]"
            >
              看怎麼去
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

function TransitStatus({ card }: { card: TransitStatusCard }) {
  const alert = card.status === 'alert'

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
  return <TransitStatus card={card} />
}
