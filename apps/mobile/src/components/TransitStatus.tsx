import { useMetroStatus } from '@/lib/transit'

/*
 * 捷運路線的即時營運狀態。
 *
 * 刻意只講 TDX 真的有給的東西：有沒有事件通報、事件內容是什麼。
 * TDX 的捷運資料沒有誤點分鐘數，所以這裡不會出現「誤點 N 分鐘」，
 * 正常時也只寫「目前正常營運」而不是保證準點。
 *
 * 拿不到資料時整個元件不顯示 —— 這是輔助資訊，不值得為它擋住畫面或跳錯誤。
 */
export function TransitStatus({ line }: { line: string }) {
  const state = useMetroStatus(line)

  if (state.status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
        <span className="size-2 animate-pulse rounded-full bg-muted" />
        查詢 {line} 即時狀態…
      </div>
    )
  }

  if (state.status === 'error') return null

  const { metro } = state
  const alert = metro.status === 'alert'

  return (
    <div className="mt-2 text-[13px]">
      <div className="flex items-center gap-2">
        <span
          className={`size-2 shrink-0 rounded-full ${alert ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
        <span className="font-semibold">{metro.line}</span>
        <span className={alert ? 'text-amber-600' : 'text-muted'}>
          {alert ? '有事件通報' : '目前正常營運'}
        </span>
      </div>

      {metro.incidents.length > 0 && (
        <ul className="mt-1.5 space-y-1 pl-4 text-muted">
          {metro.incidents.map((i) => (
            <li key={i.title + i.updatedAt}>・{i.description || i.title}</li>
          ))}
        </ul>
      )}

      {metro.arrivingNow.length > 0 && (
        <p className="mt-1.5 pl-4 text-[12px] text-muted">
          進站中：
          {metro.arrivingNow.map((a) => `${a.station}（${a.heading}）`).join('、')}
        </p>
      )}
    </div>
  )
}
