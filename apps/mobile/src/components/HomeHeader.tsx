import { SunIcon } from './icons'

/* 三張首頁稿共用的標題列：問候 + 天氣，右側是情境提示卡 */
export function HomeHeader({
  greeting = '早安，志明',
  location = '台北市信義區 32°C',
  alert = { title: '紫外線偏高', body: '記得防曬與補充水分' },
}: {
  greeting?: string
  location?: string
  alert?: { title: string; body: string } | null
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{greeting}</h1>
        <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
          {location} <SunIcon />
        </p>
      </div>

      {alert && (
        <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-[0_2px_10px_rgba(22,32,55,.10)]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-tint">
            <SunIcon />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">{alert.title}</p>
            <p className="text-[11px] text-subtle">{alert.body}</p>
          </div>
        </div>
      )}
    </header>
  )
}
