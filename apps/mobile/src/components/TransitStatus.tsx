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
          className="size-2 shrink-0 rounded-full"
          style={{
            background: alert ? 'var(--color-banner-warm-ink)' : 'var(--color-success)',
          }}
        />
        <span className="font-semibold">{metro.line}</span>
        <span
          className={alert ? undefined : 'text-muted'}
          style={alert ? { color: 'var(--color-banner-warm-ink)' } : undefined}
        >
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


/*
 * 精簡版，給行程頁的路線卡右下角用。
 *
 * 這裡原本寫死「路線正常」，不管實際狀況都這樣顯示 —— 對一個會在捷運出事時
 * 建議你改叫車的 App 來說，那是最不該造假的一格。
 *
 * 跟完整版的差別只有版型：狀態判斷、快取、錯誤處理全都共用同一個 hook。
 * 拿不到資料時顯示「狀態未知」而不是整塊消失，卡片版型才不會缺一角。
 */
export function TransitStatusBadge({ line }: { line: string }) {
  const state = useMetroStatus(line)

  const { dot, text, label } =
    state.status === 'loading'
      ? { dot: 'var(--color-subtle)', text: 'var(--color-subtle)', label: '查詢中' }
      : state.status === 'error'
        ? { dot: 'var(--color-line)', text: 'var(--color-subtle)', label: '狀態未知' }
        : state.metro.status === 'alert'
          ? {
              dot: 'var(--color-banner-warm-ink)',
              text: 'var(--color-banner-warm-ink)',
              label: '有異常',
            }
          : { dot: 'var(--color-ink)', text: 'var(--color-success)', label: '路線正常' }

  const background =
    state.status === 'ready' && state.metro.status === 'alert'
      ? 'var(--color-warning-tint)'
      : state.status === 'ready'
        ? 'var(--color-success-tint)'
        : 'var(--color-surface-2)'

  return (
    <div className="rounded-xl px-3 pb-1.5 pt-1 text-center" style={{ background }}>
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-full"
        style={{ background: dot }}
      />
      <p className="mt-0.5 text-[12px] font-semibold" style={{ color: text }}>
        {label}
      </p>
    </div>
  )
}
