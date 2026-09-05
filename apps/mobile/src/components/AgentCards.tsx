import { useNavigate } from 'react-router'

import { AlertIcon, ClockIcon, MapPinIcon } from './icons'
import type { AgentCard, MissionsCard, RoutePlanCard, TransitStatusCard } from '@/lib/agent'

/*
 * 對話裡的動作卡片。
 *
 * 存在的理由是「講不清楚」或「講完還要做一件事」：
 *   路線規劃 有幾段、在哪換線 —— 排版比一段文字好讀
 *   附近任務 使用者接下來要決定去哪一個，卡片上可以直接叫車
 *   路況     正常／異常是二元狀態，用顏色一眼看得出來，異常時能直接改叫車
 *
 * 天氣與通勤路線刻意沒有卡片：用一句話就講得完，做成卡片只是裝飾。
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
  return (
    <Shell>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">
          {card.from} → {card.to}
        </h3>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary">
          <ClockIcon />約 {card.totalMinutes} 分
        </span>
      </div>

      <p className="mt-1 text-[12px] text-muted">
        {card.transfers > 0 ? `轉乘 ${card.transfers} 次` : '直達'}
      </p>

      <ol className="relative mt-2.5 space-y-2.5">
        {/* 段落之間的連接線，跟行程頁的常用路線卡同一個語彙 */}
        {card.legs.length > 1 && (
          <span className="absolute left-[4.5px] top-3 bottom-3 w-px bg-line" />
        )}
        {card.legs.map((leg, i) => (
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
        時間為估計，不含等第一班車的時間。
      </p>
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

export function AgentCardView({ card }: { card: AgentCard }) {
  if (card.kind === 'route_plan') return <RoutePlan card={card} />
  if (card.kind === 'missions') return <Missions card={card} />
  return <TransitStatus card={card} />
}
