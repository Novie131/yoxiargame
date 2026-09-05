import { useNavigate } from 'react-router'

import { TransitStatusBadge } from '@/components/TransitStatus'
import { BellIcon } from '@/components/icons'
import { metroLineOf, useCommuteRoute, type CommuteRoute } from '@/lib/commute'
import { formatDateWithWeekday, greeting } from '@/lib/datetime'
import { useMember } from '@/lib/member'
import { useNotifications } from '@/lib/notifications'
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
 *   出發時間、抵達時間  還沒有來源，先不顯示
 *
 * 出發時間要能算，需要路徑規劃（TDX 沒有旅行時間）。在那之前寧可留白，
 * 也不要放一個看起來很具體、其實是編的時間。
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

export function TripsScreen() {
  const navigate = useNavigate()
  const { route, configured } = useCommuteRoute()
  const { unreadCount } = useNotifications()
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
