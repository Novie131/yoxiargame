import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { TransitStatusBadge } from '@/components/TransitStatus'
import { BellIcon } from '@/components/icons'
import { useAccessibilityPriority } from '@/lib/accessibility'
import {
  metroLineOf,
  ROUTE_LABEL_TEXT,
  useCommuteRoutes,
  type CommuteRoute,
} from '@/lib/commute'
import { formatDateWithWeekday, greeting, timeAfterMinutes } from '@/lib/datetime'
import { useDeparture } from '@/lib/departure'
import { useMember } from '@/lib/member'
import { useNotifications } from '@/lib/notifications'
import { isExplorePlanTrip } from '@/lib/explorePlan'
import { formatFare } from '@/lib/ride'
import {
  useRoutePlan,
  type AccessibilityPoint,
  type PlanState,
  type RoutePlan,
} from '@/lib/routePlan'
import {
  completeTrip,
  moveTrip,
  removeTrip,
  usePastTrips,
  useTomorrowTrips,
  useTripDay,
  useTrips,
  type PastTrip,
  type PlannedTrip,
} from '@/lib/trips'
import { useMetroStatus } from '@/lib/transit'

import { MoreMenu, type MenuItem } from './trips/MoreMenu'

/*
 * 對應設計稿 frame：行程 – 常用路線
 *
 * 設計稿畫的是「已經用了一段時間」的狀態：有常用路線、有 29 則通知、
 * 有下一段行程、寫著「建議 08:05 出發・預計 08:32 抵達」。
 * 新使用者看到那些會很錯亂 —— 那不是他設的路線，那些時間也不是算出來的。
 * 所以跟通勤有關的區塊都改成只有設定過路線才顯示，而且只顯示真的有來源的東西：
 *
 *   起訖站      使用者自己設定的
 *   路線即時狀態 TDX
 *   未讀通知數   後端的交通監看實際產生的通知
 *   通勤時間     TDX 的實際站間行駛時間，由 /transit/plan 算出來
 *
 * 「約 N 分鐘」曾經是寫死的 25 分。現在它有真實來源了，但仍然是估計值 ——
 * 一律寫「約」。
 *
 * 這一頁有**兩種**東西，刻意分成兩個分頁，不要混在一起：
 *
 *   即將到來        一次性的行程。使用者在對話裡規劃完、自己按了「加入今天行程」才會有；
 *                   可以改到明天。跨日後今天的變過往、明天的變今天（lib/trips.ts）。
 *   常用路線＆過往  重複發生的通勤，最多兩條（上班／回家），驅動異常通知；
 *                   以及已經過去的行程。
 *
 * 分開的理由是：一次性的規劃不該覆蓋掉他每天上班的那條路線 ——
 * 那是他早上唯一會看的東西。
 *
 * ── 為什麼要有回家那條 ──
 * 只有上班那條的話，異常通知只保護早上那一趟。而晚上才是叫車需求的高峰、
 * 末班車問題唯一會發生的時段、以及使用者最沒耐心查路線的時候 ——
 * 等於我們保護了比較不需要保護的那一段。
 */

const MODE_LABEL: Record<CommuteRoute['mode'], string> = {
  metro: '捷運',
  bus: '公車',
  mixed: '捷運＋公車',
}

/* 深色卡上的即時狀態。跟白卡的 TransitStatusBadge 共用同一個 hook 與快取，只是配色不同。 */
function DarkStatusLine({ line }: { line: string }) {
  const state = useMetroStatus(line)

  if (state.status === 'loading') {
    return <p className="mt-3 text-[13px] text-white/70">查詢 {line} 即時狀態…</p>
  }
  if (state.status === 'error') {
    return <p className="mt-3 text-[13px] text-white/70">{line}・目前取不到路況</p>
  }

  const { metro } = state
  return (
    <p className="mt-3 text-[13px] text-white/85">
      <span className="mr-1.5">🚇</span>
      {metro.line}・{metro.status === 'alert' ? metro.note : '目前無營運事件通報'}
    </p>
  )
}

/*
 * 「現在出發的話幾點到」。
 *
 * 設計稿寫的是「建議 08:05 出發・預計 08:32 抵達」。那句話現在講得出來了 ——
 * 通勤設定補上「幾點要到」之後（見 DepartureLine）。但沒設定的人仍然要有東西看，
 * 所以這裡維持從現在正推的版本，一樣有用而且每個數字都有依據。
 *
 * 捷運收班時不講抵達時間，講末班與首班：那時候「預計 04:20 抵達」是假的。
 */
function ArrivalLine({ plan }: { plan: RoutePlan }) {
  if (plan.service.status === 'closed') {
    const { line, lastTrain, firstTrain } = plan.service
    return (
      <p className="mt-2 text-[13px] text-white/85">
        <span className="mr-1.5">🌙</span>
        {line}目前沒有營運・末班 {lastTrain}、首班 {firstTrain}
      </p>
    )
  }

  return (
    <p className="mt-2 text-[13px] text-white/85">
      <span className="mr-1.5">🕘</span>
      現在出發約 {plan.totalMinutes} 分鐘・預計 {timeAfterMinutes(plan.totalMinutes)} 抵達
      {plan.peak && '（尖峰）'}
    </p>
  )
}

/*
 * 末班車倒數。
 *
 * 這是整個 App 裡最有價值的一句話，而它以前只在使用者**主動問**的時候才出現 ——
 * 但沒有人會在 00:30 想到要問「末班車還在嗎」，他會在 01:00 發現自己回不了家。
 * 所以開 App 就查、查到就講，不等他問。
 *
 * ── 兩件事一定要一起講 ──
 * 「還有 22 分鐘」單獨出現只是壞消息的預告。真正的決定是「趕不趕得上，
 * 趕不上要花多少錢」，所以叫車估價要在同一張卡上。
 *
 * ── 「還有 22 分鐘」是到站時間 ──
 * 它不含走到車站的時間。不講清楚的話，使用者會把它當成「你還有 22 分鐘可以出門」，
 * 然後慢慢走過去，然後撲空。
 */
function LastTrainCard({ plan }: { plan: RoutePlan }) {
  if (plan.service.status !== 'closing-soon') return null

  const { line, towards, minutesLeft, lastTrain } = plan.service
  const ride = plan.rideFallback

  return (
    <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3">
      <p className="text-[14px] font-semibold text-white">
        <span className="mr-1.5">🌙</span>
        {line}往{towards}末班車還有 {minutesLeft} 分鐘
      </p>
      <p className="mt-1 text-[12px] text-white/70">
        末班 {lastTrain} 到站，還沒算你走到車站的時間
      </p>

      {/*
        * 叫車估價只在這裡出現，不是每次看行程都推 ——
        * 它在這張卡上是選項，在別的地方就是推銷。
        */}
      {ride && (
        <p className="mt-2 border-t border-white/15 pt-2 text-[12px] text-white/85">
          <span className="mr-1.5">🚕</span>
          錯過的話從{plan.from}叫車約 {formatFare(ride.fare)}・{ride.basis}
        </p>
      )}
    </div>
  )
}

/*
 * 出發倒數。
 *
 * 只有設定過「幾點要到」的路線才有 —— 沒有那個錨點就沒有倒數，
 * 這時候整個元件不顯示，ArrivalLine 的「現在出發約 N 分鐘」接手。
 * 猜一個上班時間的代價是使用者錯過會議，而他會以為那是我們算好的。
 *
 * confidence 為 low 時要**看得出來**降級了，不要照常倒數 ——
 * 一個看起來一樣確定、實際上少算了等車的倒數，比不給更危險。
 */
function DepartureLine({ route }: { route: CommuteRoute }) {
  /* 沒設定抵達時間、或公車路線（規劃不出來）就不查 */
  const state = useDeparture(route.arriveBy && route.mode !== 'bus' ? route.label : null)
  if (state.status !== 'ready' || !state.departure) return null

  const d = state.departure
  const overdue = d.minutesUntilDeparture <= 0
  const low = d.confidence === 'low'

  return (
    <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3">
      <p className="text-[14px] font-semibold text-white">
        <span className="mr-1.5">{overdue ? '🏃' : '⏳'}</span>
        {overdue
          ? `已經該出門了（建議 ${d.departBy} 出發）`
          : `再 ${d.minutesUntilDeparture} 分鐘出門，${d.departBy} 出發`}
      </p>
      <p className="mt-1 text-[12px] text-white/70">
        {d.arriveBy} 要到・門到門約 {d.totalMinutes} 分鐘
        {d.waitMinutes > 0 && `（含等車 ${d.waitMinutes} 分）`}・含 {d.bufferMinutes} 分出門緩衝
      </p>

      {/* 已經來不及時才給叫車，而且照樣附上來源 */}
      {overdue && d.rideFallback && (
        <p className="mt-2 border-t border-white/15 pt-2 text-[12px] text-white/85">
          <span className="mr-1.5">🚕</span>
          現在叫車約 {formatFare(d.rideFallback.fare)}・{d.rideFallback.basis}
        </p>
      )}

      {/* 降級與依據都要講。藏起來的話這個倒數就變成一個會讓人遲到的確定數字。 */}
      {low && d.caveat && (
        <p className="mt-2 text-[12px] text-amber-200">⚠️ {d.caveat}</p>
      )}
      <p className="mt-1 text-[11px] text-white/55">{d.basis}</p>
    </div>
  )
}

/* 已設定路線時，才有「下一段行程」可言 */
function NextLegCard({ route }: { route: CommuteRoute }) {
  const { displayName } = useMember()
  const line = metroLineOf(route)
  const plan = useRoutePlan(
    route.mode === 'bus' ? null : route.origin,
    route.mode === 'bus' ? null : route.destination,
  )

  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <p className="text-[13px] text-white/70">
        {greeting()}，{displayName}
      </p>
      <h2 className="mt-1 text-[20px] font-bold">下一段：前往{route.destination}</h2>

      {plan.status === 'ready' && <ArrivalLine plan={plan.plan} />}

      {line ? (
        <DarkStatusLine line={line} />
      ) : (
        <p className="mt-3 text-[13px] text-white/85">
          <span className="mr-1.5">🚌</span>
          {route.line ?? MODE_LABEL[route.mode]}・路況有異常時會通知您
        </p>
      )}

      <DepartureLine route={route} />
      {plan.status === 'ready' && <LastTrainCard plan={plan.plan} />}
    </div>
  )
}

/*
 * 還沒設定路線時的招呼卡。
 *
 * 下面已經列著今天的行程時，不能再寫「還沒有安排行程」—— 同一頁自相矛盾。
 * 那時候缺的只是常用路線，就照實講缺什麼。
 */
function WelcomeCard({ hasTrips, onSetup }: { hasTrips: boolean; onSetup: () => void }) {
  const { displayName } = useMember()

  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <p className="text-[13px] text-white/70">{greeting()}，{displayName}</p>
      <h2 className="mt-1 text-[20px] font-bold">
        {hasTrips ? '還沒有設定常用路線' : '還沒有安排行程'}
      </h2>
      <p className="mt-3 text-[13px] text-white/85">
        設定一條常用路線，之後這裡會顯示路況提醒。
      </p>
      {/* 設定入口在另一個分頁，新使用者不會想到要切過去找，這裡直接給 */}
      <button
        type="button"
        onClick={onSetup}
        className="mt-3 min-h-11 rounded-xl bg-white/10 px-4 text-[14px] font-semibold text-white"
      >
        設定通勤路線
      </button>
    </div>
  )
}

function RouteStop({
  label,
  station,
  color,
}: {
  label: string
  station: string
  color: string
}) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="-mt-1">
        <p className="text-[12px] text-subtle">{label}</p>
        <p className="text-[16px] font-semibold">{station}</p>
      </div>
    </div>
  )
}

function EmptyRouteCard({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
      <span className="text-[28px]">🚇</span>
      <p className="mt-2 text-[15px] font-semibold">還沒有常用路線</p>
      <p className="mx-auto mt-1 max-w-[15rem] text-[13px] text-muted">
        設定每天的通勤起訖站，捷運或公車有狀況時就能第一時間通知你。
      </p>
      <button
        type="button"
        onClick={onSetup}
        className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98]"
      >
        設定通勤路線
      </button>
    </div>
  )
}

/*
 * 轉乘站與出站口的電梯資訊。
 *
 * 只有開啟「優先顯示無障礙路線」才會出現，理由見 lib/accessibility.ts。
 *
 * ── 三態一定要分得出來 ──
 *   有電梯    列出是哪幾個出口
 *   沒有電梯  照實說沒有
 *   查不到    寫「查無資料」，**不要**寫成「沒有電梯」
 *
 * 最後那一條是這個功能的重點。告訴一個坐輪椅的人某個出口有電梯而實際沒有，
 * 比不給資訊糟糕得多 —— 他會走過去，然後卡在那裡。
 * 反過來把「查不到」講成「沒有」，他會白繞去一個更遠的站。
 */
function AccessibilityLine({ points }: { points: AccessibilityPoint[] }) {
  return (
    <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[12px] font-semibold text-subtle">♿️ 電梯與出口</p>
      <ul className="mt-1.5 space-y-1">
        {points.map((point) => {
          const role = point.role === 'exit' ? '出站' : '轉乘'
          const facility = point.facility

          const detail =
            facility === null || facility.hasElevator === null
              ? '查無電梯資料'
              : facility.hasElevator
                ? `電梯出口：${facility.elevatorExits.map((e) => e.name).join('、')}`
                : '這一站沒有登錄電梯出口'

          return (
            <li key={`${point.role}-${point.stationId}`} className="text-[12px] text-muted">
              <span className="font-medium text-ink">
                {role}・{point.station}
              </span>
              <span className="mx-1">—</span>
              {detail}
            </li>
          )
        })}
      </ul>
      {/* 資料來源要講。使用者得知道這不是我們自己走過確認的。 */}
      <p className="mt-1.5 text-[11px] text-subtle">資料來自 TDX 車站出入口，查無資料時請以現場為準</p>
    </div>
  )
}

/*
 * 「查看路線」展開的分段。
 *
 * 資料就是卡片上那個「約 N 分鐘」的同一份規劃（TDX 站間行駛時間），
 * 不另外查、也不帶去對話 —— 看一下怎麼走不值得叫一次模型，而且 demo 時不會因為網路慢就卡住。
 */
function RouteLegs({ plan, mode }: { plan: PlanState; mode: CommuteRoute['mode'] }) {
  if (plan.status === 'loading') {
    return <p className="text-[13px] text-muted">計算路線中…</p>
  }
  if (plan.status !== 'ready') {
    return (
      <p className="text-[13px] text-muted">
        {mode === 'bus'
          ? '公車路線目前沒有分段資訊，路況異常時仍會通知你。'
          : '目前查不到這條路線的分段資訊，請稍後再試。'}
      </p>
    )
  }

  const { legs } = plan.plan
  return (
    <>
      <ol className="relative space-y-2.5">
        {/* 段落之間的連接線，跟對話裡的路線卡同一個語彙 */}
        {legs.length > 1 && <span className="absolute bottom-3 left-[4.5px] top-3 w-px bg-line" />}
        {legs.map((leg, i) => (
          <li key={`${leg.lineId}-${i}`} className="flex gap-3">
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
      <p className="mt-2.5 text-[11px] text-subtle">時間為估計值，等車依班距估算。</p>
    </>
  )
}

function FrequentRouteCard({
  route,
  onEdit,
  onSettings,
}: {
  route: CommuteRoute
  onEdit: () => void
  onSettings: () => void
}) {
  const line = metroLineOf(route)
  const accessibility = useAccessibilityPriority()
  const [expanded, setExpanded] = useState(false)
  const legsId = useId()
  /* 公車路線查不到捷運路網，會回 unavailable，那就只顯示運具不顯示時間 */
  const plan = useRoutePlan(
    route.mode === 'bus' ? null : route.origin,
    route.mode === 'bus' ? null : route.destination,
    accessibility,
  )

  const labelText = ROUTE_LABEL_TEXT[route.label]

  /* 這個「約 N 分鐘」現在含依班距估算的等車，所以尖峰離峰看到的數字會不一樣 */
  const summary =
    plan.status === 'ready'
      ? `約 ${plan.plan.totalMinutes} 分鐘${plan.plan.transfers > 0 ? `・轉乘 ${plan.plan.transfers} 次` : '・直達'}${plan.plan.peak ? '・尖峰' : ''}`
      : plan.status === 'loading'
        ? '計算路線中…'
        : null

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[0_2px_12px_rgba(22,32,55,.06)]">
      <div className="flex items-start justify-between">
        <div className="rounded-xl bg-success-tint px-3 py-1.5 text-center">
          <span className="text-[15px]">{route.label === 'home' ? '🏠' : '💼'}</span>
          <p className="text-[12px] font-semibold text-success">{labelText.title}</p>
        </div>
        {/*
          * 設計稿的「•••」。CTA 改成「查看路線」之後，「修改路線」就收進這裡 ——
          * 修改是偶爾才做的事，不該佔掉每天都會看的那顆大按鈕。
          */}
        <MoreMenu
          label={`${labelText.title}路線選項`}
          items={[
            { label: '修改路線', onSelect: onEdit },
            { label: '通勤提醒設定', onSelect: onSettings },
          ]}
        />
      </div>

      <div className="relative mt-3 space-y-4">
        {/* 兩站之間的連接線 */}
        <span className="absolute left-[4.5px] top-4 h-8 w-px bg-line" />
        {/* 回家那條的起訖標籤是反過來的 —— 寫死「住家 → 公司」會讓它整張卡都在說謊 */}
        <RouteStop label={labelText.from} station={route.origin} color="var(--color-ink)" />
        <RouteStop
          label={labelText.to}
          station={route.destination}
          color="var(--color-primary)"
        />
      </div>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-black/[.07] pt-3.5">
        <p className="text-[13px] text-muted">
          <span className="mr-1.5">🚇</span>
          {route.line ?? MODE_LABEL[route.mode]}
          {summary && <span>・{summary}</span>}
        </p>
        {/* 沒有可查的捷運路線名就不顯示狀態，理由見 metroLineOf */}
        {line ? <TransitStatusBadge line={line} /> : null}
      </div>

      {/* 票價。查不到就整行不顯示，不要用距離推一個數字。 */}
      {plan.status === 'ready' && plan.plan.fare && (
        <p className="mt-2 text-[12px] text-muted">
          <span className="mr-1.5">🎫</span>
          NT${plan.plan.fare.singleJourney}・{plan.plan.fare.basis}
        </p>
      )}

      {accessibility && plan.status === 'ready' && plan.plan.accessibility && (
        <AccessibilityLine points={plan.plan.accessibility} />
      )}

      {expanded && (
        <div id={legsId} className="mt-3 rounded-xl bg-surface-2 px-3 py-3">
          <RouteLegs plan={plan} mode={route.mode} />
        </div>
      )}

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={legsId}
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98]"
      >
        {expanded ? '收合路線' : '查看路線'}
      </button>
    </div>
  )
}

/*
 * 一筆規劃好的行程（今天或明天）。
 *
 * 刻意做得比常用路線卡輕 —— 它是使用者臨時決定的一趟，
 * 不是需要長期追蹤的東西。所以不查即時狀態、也沒有大顆的 CTA；
 * 改日期、標記完成、移除都收在「•••」裡。
 */
function TripCard({ trip, actions }: { trip: PlannedTrip; actions: MenuItem[] }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface py-3 pl-4 pr-3 shadow-[0_2px_12px_rgba(22,32,55,.06)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {trip.from} → {trip.to}
        </p>
        <p className="mt-1 truncate text-[12px] text-muted">
          {/* 探索小行程的分鐘數只是停留時間，交通還沒算，不能寫成直達幾分 */}
          {isExplorePlanTrip(trip) ? (
            <>
              <span className="mr-1.5">📍</span>
              {trip.lines.join(' → ')}
              {`・停留約 ${trip.totalMinutes} 分`}
            </>
          ) : (
            <>
              <span className="mr-1.5">🚇</span>
              {trip.lines.join(' → ')}
              {trip.transfers > 0 ? `・轉乘 ${trip.transfers} 次` : '・直達'}
              {`・約 ${trip.totalMinutes} 分`}
            </>
          )}
        </p>
      </div>
      <MoreMenu label={`${trip.from} 到 ${trip.to} 的行程選項`} items={actions} />
    </div>
  )
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

/* YYYY-MM-DD 的前一天。跟 lib/trips 的 nextDay 一樣用 UTC 做純日期運算。 */
function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/* 過往行程的日期欄：近的寫「今天／昨天」，其餘寫月/日，下面一律附星期 */
function pastDateLabel(date: string, today: string): { main: string; weekday: string } {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = `週${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`
  if (date === today) return { main: '今天', weekday }
  if (date === prevDay(today)) return { main: '昨天', weekday }
  return { main: `${m}/${d}`, weekday }
}

function PastTripRow({ trip, today }: { trip: PastTrip; today: string }) {
  const { main, weekday } = pastDateLabel(trip.date, today)
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="w-11 shrink-0 text-center">
        <p className="text-[14px] font-semibold">{main}</p>
        <p className="text-[11px] text-subtle">{weekday}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {trip.from} → {trip.to}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {isExplorePlanTrip(trip) ? (
            <>
              <span className="mr-1.5">📍</span>
              {trip.lines.join(' → ')}
              {`・停留約 ${trip.totalMinutes} 分`}
            </>
          ) : (
            <>
              <span className="mr-1.5">🚇</span>
              捷運・{trip.lines.join(' → ')}
              {`・約 ${trip.totalMinutes} 分`}
            </>
          )}
        </p>
      </div>
      {/*
        * 只有他自己按了「標記完成」的才寫已完成。
        * 日期過了自動歸檔的那筆，我們不知道他到底有沒有去。
        */}
      {trip.endedBy === 'done' && (
        <span className="shrink-0 rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-semibold text-success">
          已完成
        </span>
      )}
    </li>
  )
}

/* 過往行程先列幾筆就好，其餘收在「查看全部」 */
const PAST_PREVIEW = 3

function PastTripsSection() {
  const history = usePastTrips()
  const today = useTripDay()
  const [showAll, setShowAll] = useState(false)
  const listId = useId()

  const shown = showAll ? history : history.slice(0, PAST_PREVIEW)
  const hasMore = history.length > PAST_PREVIEW

  return (
    <section aria-labelledby={`${listId}-title`} className="space-y-3">
      <SectionHeader
        id={`${listId}-title`}
        title="過往行程"
        aside={
          hasMore ? (
            <button
              type="button"
              aria-expanded={showAll}
              aria-controls={listId}
              onClick={() => setShowAll((v) => !v)}
              className="hit-area text-[13px] font-medium text-primary"
            >
              {showAll ? '收合' : `查看全部（${history.length}）`}
            </button>
          ) : history.length > 0 ? (
            <span className="text-[13px] text-subtle">{history.length} 筆</span>
          ) : null
        }
      />
      {history.length > 0 ? (
        <ul
          id={listId}
          className="divide-y divide-black/[.07] rounded-2xl bg-surface px-4 shadow-[0_2px_12px_rgba(22,32,55,.06)]"
        >
          {shown.map((trip) => (
            <PastTripRow key={trip.id} trip={trip} today={today} />
          ))}
        </ul>
      ) : (
        <EmptyNote>還沒有過往行程。行程標記完成、或過了當天，就會留在這裡。</EmptyNote>
      )}
    </section>
  )
}

function SectionHeader({
  id,
  title,
  aside,
}: {
  id?: string
  title: string
  aside?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 id={id} className="text-[18px] font-bold">
        {title}
      </h2>
      {aside}
    </div>
  )
}

/* 區塊沒有資料時的一句話。刻意比 EmptyRouteCard 輕，一頁上不要疊好幾張大空卡。 */
function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-surface px-4 py-3.5 text-[13px] text-muted">{children}</p>
  )
}

function UpcomingPanel() {
  const navigate = useNavigate()
  const { route } = useCommuteRoutes()
  const today = useTrips()
  const tomorrow = useTomorrowTrips()

  return (
    <div className="space-y-4">
      {route ? (
        <NextLegCard route={route} />
      ) : (
        <WelcomeCard
          hasTrips={today.length > 0 || tomorrow.length > 0}
          onSetup={() => navigate('/commute-setup')}
        />
      )}

      <section className="space-y-3">
        <SectionHeader
          title="稍後行程"
          aside={
            today.length > 0 ? (
              <span className="text-[13px] text-subtle">{today.length} 筆</span>
            ) : null
          }
        />
        {today.length > 0 ? (
          <div className="space-y-3">
            {today.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                actions={[
                  { label: '改到明天', onSelect: () => moveTrip(trip.id, 'tomorrow') },
                  { label: '標記完成', onSelect: () => completeTrip(trip.id) },
                  { label: '移除', onSelect: () => removeTrip(trip.id), danger: true },
                ]}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface py-2 pl-4 pr-2">
            <p className="text-[13px] text-muted">今天沒有其他行程。在對話裡規劃路線後可以加進來。</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="min-h-11 shrink-0 rounded-xl px-3 text-[13px] font-medium text-primary"
            >
              去規劃
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="明日行程"
          aside={
            tomorrow.length > 0 ? (
              <span className="text-[13px] text-subtle">{tomorrow.length} 筆</span>
            ) : null
          }
        />
        {tomorrow.length > 0 ? (
          <div className="space-y-3">
            {tomorrow.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                actions={[
                  { label: '改回今天', onSelect: () => moveTrip(trip.id, 'today') },
                  { label: '移除', onSelect: () => removeTrip(trip.id), danger: true },
                ]}
              />
            ))}
          </div>
        ) : (
          <EmptyNote>明天還沒有行程。稍後行程可以從「•••」改到明天。</EmptyNote>
        )}
      </section>
    </div>
  )
}

function RoutesPanel() {
  const navigate = useNavigate()
  /* list 已經是「上班那條在前」的順序，畫面不要自己再排一次 */
  const { route, list, configured } = useCommuteRoutes()
  const setup = () => navigate('/commute-setup')
  const settings = () => navigate('/settings')

  return (
    <div className="space-y-4">
      <SectionHeader
        title="常用路線"
        aside={
          configured ? (
            <button
              type="button"
              onClick={setup}
              className="hit-area text-[13px] font-medium text-primary"
            >
              管理
            </button>
          ) : null
        }
      />

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((r) => (
            <FrequentRouteCard key={r.label} route={r} onEdit={setup} onSettings={settings} />
          ))}

          {/*
            * 只設了上班那條時，提示還可以設回家那條。
            *
            * 放在這裡而不是設定頁，是因為使用者不會為了找一個他不知道存在的
            * 功能而進設定頁。而晚上那一段才是叫車需求與末班車問題的高峰。
            */}
          {!list.some((r) => r.label === 'home') && (
            <button
              type="button"
              onClick={setup}
              className="w-full rounded-2xl border border-dashed border-line bg-surface px-4 py-3.5 text-left"
            >
              <p className="text-[14px] font-semibold">
                <span className="mr-1.5">🏠</span>
                也設定回家那條？
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                回程的末班車時間與班距都跟去程不同，設定後晚上也會收到路況提醒。
              </p>
            </button>
          )}
        </div>
      ) : (
        <EmptyRouteCard onSetup={setup} />
      )}

      {/*
        * 這張卡原本只要有路線就寫「已開啟通勤提醒」。
        * 設定頁可以關掉通知之後，那就變成謊話了 —— 使用者明明關了，
        * 行程頁還跟他說開著。現在照著 notificationEnabled 顯示實際狀態。
        */}
      {route && (
        <button
          type="button"
          onClick={settings}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
          style={{
            background: route.notificationEnabled
              ? 'var(--color-primary-tint)'
              : 'var(--color-surface-3)',
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-[16px]">
            {route.notificationEnabled ? '✨' : '🔕'}
          </span>
          <div>
            <p className="text-[14px] font-semibold">
              {route.notificationEnabled ? '已開啟通勤提醒' : '通勤提醒已關閉'}
            </p>
            <p className="mt-0.5 text-[12px] text-subtle">
              {route.notificationEnabled
                ? '捷運有事件通報時會通知你，並提供計程車替代方案'
                : '目前不會收到路線異常的通知，點此前往設定'}
            </p>
          </div>
        </button>
      )}

      <PastTripsSection />
    </div>
  )
}

type TabKey = 'upcoming' | 'routes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: '即將到來' },
  { key: 'routes', label: '常用路線＆過往行程' },
]

export function TripsScreen() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const baseId = useId()

  /*
   * 分頁記在網址上（?tab=routes），不放 state：
   * 從常用路線卡進設定頁再按返回，要回到同一個分頁，而不是被彈回「即將到來」。
   */
  const [params, setParams] = useSearchParams()
  const tab: TabKey = params.get('tab') === 'routes' ? 'routes' : 'upcoming'
  const selectTab = (key: TabKey) => {
    setParams(key === 'upcoming' ? {} : { tab: key }, { replace: true })
  }

  const tabId = (key: TabKey) => `${baseId}-tab-${key}`
  const panelId = (key: TabKey) => `${baseId}-panel-${key}`

  /* 左右鍵切換分頁，照 WAI-ARIA tabs 的自動啟用模式 */
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.key === tab)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next === null) return
    e.preventDefault()
    const key = TABS[next].key
    selectTab(key)
    document.getElementById(tabId(key))?.focus()
  }

  return (
    /*
     * shrink-0：外層 main 是 flex 欄，min-h-full 會蓋掉 flex 子項預設的 min-height: auto，
     * 內容比一屏長時這個 div 被壓回一屏高、底色在捲動到一半時斷掉變白。
     */
    <div className="min-h-full shrink-0 bg-surface-2">
      <header className="bg-surface px-5 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">我的行程</h1>
            {/* 設計稿寫的是 8 月 26 日・星期三（2026 年該日確實是星期三），
                但日期應該跟著今天走，不能寫死 */}
            <p className="mt-1 text-[13px] text-muted">{formatDateWithWeekday()}</p>
          </div>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `通知，${unreadCount} 則未讀` : '通知'}
            onClick={() => navigate('/notifications')}
            className="hit-area pt-1.5"
          >
            <BellIcon />
            {/* 這個數字現在是真的：後端監看到的、與這個人路線相關的未讀事件 */}
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div
          role="tablist"
          aria-label="行程分類"
          onKeyDown={onTabKeyDown}
          className="mt-3 flex border-b border-surface-4"
        >
          {TABS.map(({ key, label }) => {
            const selected = key === tab
            return (
              <button
                key={key}
                id={tabId(key)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(key)}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(key)}
                className={`relative flex min-h-12 flex-1 items-center justify-center px-1 text-[14px] ${
                  selected ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                {label}
                {selected && (
                  <span className="absolute inset-x-4 -bottom-px h-[3px] rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div
        id={panelId(tab)}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="px-4 py-4"
      >
        {tab === 'upcoming' ? <UpcomingPanel /> : <RoutesPanel />}
      </div>
    </div>
  )
}
