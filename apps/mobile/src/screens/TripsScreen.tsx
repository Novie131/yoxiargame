import { BellIcon } from '@/components/icons'

/* 對應設計稿 frame：行程 – 常用路線 */

function NextLegCard() {
  return (
    <div className="rounded-2xl bg-ink px-5 py-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-white/70">早安，志明</p>
          <h2 className="mt-1 text-[20px] font-bold">下一段：前往公司</h2>
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

function FrequentRouteCard() {
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
        <RouteStop label="住家" station="板橋站" color="var(--color-ink)" />
        <RouteStop label="公司" station="市政府站" color="var(--color-primary)" />
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-black/[.07] pt-3.5">
        <p className="text-[13px] text-muted">
          <span className="mr-1.5">🚇</span>板南線・約 25 分鐘
        </p>
        <div className="rounded-xl bg-success-tint px-3 pb-1.5 pt-1 text-center">
          <span className="mx-auto block h-2.5 w-2.5 rounded-full bg-ink" />
          <p className="mt-0.5 text-[12px] font-semibold text-success">路線正常</p>
        </div>
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
  return (
    <div className="min-h-full bg-surface-2">
      <header className="flex items-start justify-between bg-surface px-5 pb-5 pt-2">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">我的行程</h1>
          <p className="mt-1 text-[13px] text-muted">8 月 26 日・星期三</p>
        </div>
        <button type="button" aria-label="通知" className="relative pt-1.5">
          <BellIcon />
          <span className="absolute -right-1.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
            29
          </span>
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        <NextLegCard />

        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[18px] font-bold">常用路線</h2>
          <button type="button" className="text-[13px] font-medium text-primary">
            管理
          </button>
        </div>

        <FrequentRouteCard />

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
      </div>
    </div>
  )
}
