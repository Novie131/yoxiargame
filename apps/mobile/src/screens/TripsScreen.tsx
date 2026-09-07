import { useNavigate } from 'react-router'

import { TransitStatusBadge } from '@/components/TransitStatus'
import { BellIcon } from '@/components/icons'
import { metroLineOf, useCommuteRoute, type CommuteRoute } from '@/lib/commute'
import { formatDateWithWeekday, greeting, timeAfterMinutes } from '@/lib/datetime'
import { useMember } from '@/lib/member'
import { useNotifications } from '@/lib/notifications'
import { useRoutePlan } from '@/lib/routePlan'
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
 *   常用路線    重複發生的通勤，一人一條，驅動異常通知。
 *
 * 分開的理由是：一次性的規劃不該覆蓋掉他每天上班的那條路線 ——
 * 那是他早上唯一會看的東西。
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
 * 設計稿寫的是「建議 08:05 出發・預計 08:32 抵達」，但那需要知道使用者
 * 「幾點要到」才能反推出發時間，而我們沒有收集那個欄位。所以這裡改成
 * 從現在正推 —— 一樣有用，而且每個數字都有依據。
 *
 * 捷運收班時不講抵達時間，講末班與首班：那時候「預計 04:20 抵達」是假的。
 */
function ArrivalLine({ route }: { route: CommuteRoute }) {
  const plan = useRoutePlan(
    route.mode === 'bus' ? null : route.origin,
    route.mode === 'bus' ? null : route.destination,
  )

  if (plan.status !== 'ready') return null

  if (plan.plan.service.status === 'closed') {
    const { line, lastTrain, firstTrain } = plan.plan.service
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
      現在出發約 {plan.plan.totalMinutes} 分鐘・預計 {timeAfterMinutes(plan.plan.totalMinutes)} 抵達
      {plan.plan.peak && '（尖峰）'}
    </p>
  )
}

/* 已設定路線時，才有「下一段行程」可言 */
function NextLegCard({ route }: { route: CommuteRoute }) {
  const { displayName } = useMember()
  const line = metroLineOf(route)

  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <p className="text-[13px] text-white/70">
        {greeting()}，{displayName}
      </p>
      <h2 className="mt-1 text-[20px] font-bold">下一段：前往{route.destination}</h2>

      <ArrivalLine route={route} />

      {line ? (
        <DarkStatusLine line={line} />
      ) : (
        <p className="mt-3 text-[13px] text-white/85">
          <span className="mr-1.5">🚌</span>
          {route.line ?? MODE_LABEL[route.mode]}・路況有異常時會通知您
        </p>
      )}
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

function FrequentRouteCard({ route, onEdit }: { route: CommuteRoute; onEdit: () => void }) {
  const line = metroLineOf(route)
  /* 公車路線查不到捷運路網，會回 unavailable，那就只顯示運具不顯示時間 */
  const plan = useRoutePlan(
    route.mode === 'bus' ? null : route.origin,
    route.mode === 'bus' ? null : route.destination,
  )

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
          <span className="text-[15px]">💼</span>
          <p className="text-[12px] font-semibold text-success">每日通勤</p>
        </div>
        <button type="button" aria-label="更多" className="flex gap-1 pt-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-line" />
          ))}
        </button>
      </div>

      <div className="relative mt-4 space-y-4">
        {/* 兩站之間的連接線 */}
        <span className="absolute left-[4.5px] top-4 h-8 w-px bg-line" />
        <RouteStop label="住家" station={route.origin} color="var(--color-ink)" />
        <RouteStop label="公司" station={route.destination} color="var(--color-primary)" />
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
  const { route, configured } = useCommuteRoute()
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
          className="relative pt-1.5"
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

        {route ? (
          <FrequentRouteCard route={route} onEdit={setup} />
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
