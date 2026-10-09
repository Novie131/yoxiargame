import type { GeofenceEntry } from '@/lib/geofence'

/*
 * 走進任務圍欄時跳出來的提示。
 *
 * 這是「動態地理圍欄」在畫面上唯一看得到的地方 —— 在它之前，任務永遠要
 * 使用者自己想到去查。現在是反過來的：他走到了，App 主動講。
 *
 * ── 為什麼是橫幅不是系統通知 ──
 * 系統通知要推播能力（ROADMAP 的 B8），而且 App 開著的時候推系統通知
 * 本來就會被作業系統壓下來。App 開著時用 App 內的橫幅才是對的形式；
 * App 沒開的那個情境，橫幅做不到，系統通知也還沒有 —— 那是 ③b 的範圍。
 *
 * ── 為什麼可以關掉 ──
 * 使用者可能正在做別的事。提示要能被關掉，而且關掉之後同一個任務
 * 這次工作階段不再跳（見 geofence.ts 的 announced）——
 * 一直跳的提示會讓人直接關掉定位權限，那比沒有提示更糟。
 */
export function GeofenceToast({
  entry,
  onOpen,
  onDismiss,
}: {
  entry: GeofenceEntry
  /** 打開這個任務的詳情面板（裡面才有打卡按鈕） */
  onOpen: () => void
  onDismiss: () => void
}) {
  return (
    <div
      /*
       * 蓋在 tab bar 上方。fixed 而不是 absolute —— 它要浮在整個畫面之上，
       * 不受探索頁捲動位置影響。
       *
       * 72px 是 tab bar（56px）加間距；有 home indicator 的 iPhone 上
       * tab bar 會再被 safe-bottom 墊高，這裡要跟著加，不然會疊到 tab bar 上。
       */
      className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-40 px-4"
      role="status"
    >
      <div className="mx-auto flex max-w-shell items-center gap-3 rounded-2xl bg-ink px-4 py-3 shadow-[0_6px_20px_rgba(22,32,55,.28)]">
        <span className="text-[20px]">📍</span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">
            你到了「{entry.mission.name}」
          </p>
          <p className="mt-0.5 text-[12px] text-white/70">
            距離中心 {entry.distanceMeters} 公尺・可以打卡了
          </p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-95"
        >
          打卡
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="關閉提示"
          className="shrink-0 px-1 text-[18px] leading-none text-white/60"
        >
          ×
        </button>
      </div>
    </div>
  )
}
