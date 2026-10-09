import { useNavigate } from 'react-router'

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
import { formatFare } from '@/lib/ride'
import { useRoutePlan, type AccessibilityPoint, type RoutePlan } from '@/lib/routePlan'
import { removeTrip, useTrips, type PlannedTrip } from '@/lib/trips'
import { useMetroStatus } from '@/lib/transit'

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
 * 這一頁有**兩種**東西，刻意分成兩區，不要混在一起：
 *
 *   今天的行程  一次性。使用者在對話裡規劃完、自己按了「加入今天行程」才會有。
 *               跨日就消失（lib/trips.ts）。
 *   常用路線    重複發生的通勤，最多兩條（上班／回家），驅動異常通知。
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

/* 還沒設定路線時的招呼卡。不講任何行程，因為根本還沒有。 */
function WelcomeCard() {
  const { displayName } = useMember()

  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <p className="text-[13px] text-white/70">{greeting()}，{displayName}</p>
      <h2 className="mt-1 text-[20px] font-bold">還沒有安排行程</h2>
      <p className="mt-3 text-[13px] text-white/85">
        設定一條常用路線，之後這裡會顯示路況提醒。
      </p>
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

function FrequentRouteCard({ route, onEdit }: { route: CommuteRoute; onEdit: () => void }) {
  const line = metroLineOf(route)
  const accessibility = useAccessibilityPriority()
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
          * 設計稿的「⋯」。唯一有意義的去處是通勤設定，所以就直接接過去 ——
          * 為了一個選項開一張選單，多一次點擊而已。
          */}
        <button
          type="button"
          aria-label="編輯通勤路線"
          onClick={onEdit}
          className="flex gap-1 pt-2"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-line" />
          ))}
        </button>
      </div>

      <div className="relative mt-4 space-y-4">
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

      <div className="mt-4 flex items-end justify-between border-t border-black/[.07] pt-3.5">
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

      <button
        type="button"
        onClick={onEdit}
        className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98]"
      >
        修改路線
      </button>
    </div>
  )
}

/*
 * 一筆今天的行程。
 *
 * 刻意做得比常用路線卡輕 —— 它是使用者今天臨時決定的一趟，
 * 不是需要長期追蹤的東西。所以不查即時狀態、也沒有大顆的 CTA。
 */
function TodayTripCard({ trip, onRemove }: { trip: PlannedTrip; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[0_2px_12px_rgba(22,32,55,.06)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {trip.from} → {trip.to}
        </p>
        <p className="mt-1 truncate text-[12px] text-muted">
          <span className="mr-1.5">🚇</span>
          {trip.lines.join(' → ')}
          {trip.transfers > 0 ? `・轉乘 ${trip.transfers} 次` : '・直達'}
          {`・約 ${trip.totalMinutes} 分`}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除 ${trip.from} 到 ${trip.to} 的行程`}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] text-subtle"
      >
        移除
      </button>
    </div>
  )
}

export function TripsScreen() {
  const navigate = useNavigate()
  /* list 已經是「上班那條在前」的順序，畫面不要自己再排一次 */
  const { route, list, configured } = useCommuteRoutes()
  const { unreadCount } = useNotifications()
  const trips = useTrips()
  const setup = () => navigate('/commute-setup')

  return (
    <div className="min-h-full bg-surface-2">
      <header className="flex items-start justify-between bg-surface px-5 pb-5 pt-2">
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
      </header>

      <div className="space-y-4 px-4 py-4">
        {route ? <NextLegCard route={route} /> : <WelcomeCard />}

        {/*
          * 只有真的有行程才顯示這一區。空狀態留給常用路線那邊就好 ——
          * 兩個空卡片疊在一起，使用者會以為這頁壞了。
          */}
        {trips.length > 0 && (
          <>
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[18px] font-bold">今天的行程</h2>
              <span className="text-[13px] text-subtle">{trips.length} 筆</span>
            </div>
            <div className="space-y-3">
              {trips.map((trip) => (
                <TodayTripCard key={trip.id} trip={trip} onRemove={() => removeTrip(trip.id)} />
              ))}
            </div>
          </>
        )}

        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[18px] font-bold">常用路線</h2>
          {configured && (
            <button
              type="button"
              onClick={setup}
              className="text-[13px] font-medium text-primary"
            >
              管理
            </button>
          )}
        </div>

        {list.length > 0 ? (
          <div className="space-y-3">
            {list.map((r) => (
              <FrequentRouteCard key={r.label} route={r} onEdit={setup} />
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
            onClick={() => navigate('/settings')}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
            style={{
              background: route.notificationEnabled
                ? 'var(--color-primary-tint)'
                : 'var(--color-surface-2)',
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
      </div>
    </div>
  )
}
