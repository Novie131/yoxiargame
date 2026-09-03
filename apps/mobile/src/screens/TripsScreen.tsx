import { useNavigate } from 'react-router'

import { TransitStatusBadge } from '@/components/TransitStatus'
import { BellIcon } from '@/components/icons'
import { useCommuteRoute, type CommuteRoute } from '@/lib/commute'
import { formatDateWithWeekday, greeting } from '@/lib/datetime'
import { useMember } from '@/lib/member'

/*
 * 對應設計稿 frame：行程 – 常用路線
 *
 * 設計稿畫的是「已經用了一段時間」的狀態：有常用路線、有 29 則通知、
 * 有下一段行程。新使用者看到那些會很錯亂 —— 那不是他設的路線。
 * 所以跟通勤有關的三塊（下一段、常用路線、通勤提醒）都改成
 * 只有設定過路線才顯示，沒設定就給空狀態與設定入口。
 *
 * 通知數字同理：目前那些通知全都是通勤相關的，沒有路線就不會有通知。
 */

/* 已設定路線時，才有「下一段行程」可言 */
function NextLegCard({ route }: { route: CommuteRoute }) {
  const { displayName } = useMember()

  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-white/70">
            {greeting()}，{displayName}
          </p>
          <h2 className="mt-1 text-[20px] font-bold">下一段：前往{route.destination}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-success px-4 py-2 text-[14px] font-semibold">
          準時
        </span>
      </div>
      <p className="mt-3 text-[13px] text-white/85">
        <span className="mr-1.5">⏰</span>建議 08:05 出發・預計 08:32 抵達
      </p>
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
        設定一條常用路線，之後這裡會顯示出發時間與路況提醒。
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

function FrequentRouteCard({ route }: { route: CommuteRoute }) {
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
          {route.line ? `${route.line}・` : ''}約 {route.durationMinutes} 分鐘
        </p>
        {/* 路線名是空的就沒得查（例如公車路線還沒填 line），那就不顯示狀態 */}
        {route.line ? <TransitStatusBadge line={route.line} /> : null}
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98]"
      >
        查看路線
      </button>
    </div>
  )
}

export function TripsScreen() {
  const navigate = useNavigate()
  const { route, configured } = useCommuteRoute()

  return (
    <div className="min-h-full bg-surface-2">
      <header className="flex items-start justify-between bg-surface px-5 pb-5 pt-2">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">我的行程</h1>
          {/* 設計稿寫的是 8 月 26 日・星期三（2026 年該日確實是星期三），
              但日期應該跟著今天走，不能寫死 */}
          <p className="mt-1 text-[13px] text-muted">{formatDateWithWeekday()}</p>
        </div>
        <button type="button" aria-label="通知" className="relative pt-1.5">
          <BellIcon />
          {/* 通知目前全都來自通勤路線，沒設定路線就不會有未讀 */}
          {configured && (
            <span className="absolute -right-1.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
              29
            </span>
          )}
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        {route ? <NextLegCard route={route} /> : <WelcomeCard />}

        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[18px] font-bold">常用路線</h2>
          {configured && (
            <button type="button" className="text-[13px] font-medium text-primary">
              管理
            </button>
          )}
        </div>

        {route ? (
          <FrequentRouteCard route={route} />
        ) : (
          <EmptyRouteCard onSetup={() => navigate('/commute-setup')} />
        )}

        {configured && (
          <div className="flex items-center gap-3 rounded-2xl bg-primary-tint px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-[16px]">
              ✨
            </span>
            <div>
              <p className="text-[14px] font-semibold">已開啟通勤提醒</p>
              <p className="mt-0.5 text-[12px] text-subtle">
                若捷運延誤，會即時提供計程車替代方案
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
