import { Capacitor } from '@capacitor/core'

/*
 * 瀏覽器預覽時畫一條假狀態列，讓畫面跟設計稿對得起來。
 * 跑在真機（Capacitor）時系統本來就有狀態列，所以不渲染，避免疊兩層。
 */
export function StatusBar({ time = '09:41' }: { time?: string }) {
  if (Capacitor.isNativePlatform()) return null

  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-6 text-[15px] font-semibold text-ink">
      <span>{time}</span>
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 18 12" width="18" height="12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.5" y="6" width="3" height="6" rx="1" />
          <rect x="9" y="3.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="1" width="3" height="11" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" width="16" height="12" fill="none">
          <path
            d="M1 4.2a10 10 0 0 1 14 0M3.5 7a6.5 6.5 0 0 1 9 0M8 10.2h.01"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <svg viewBox="0 0 26 12" width="26" height="12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="19" height="8" rx="1.8" fill="currentColor" />
          <path d="M24.5 4.5v3a2 2 0 0 0 0-3Z" fill="currentColor" opacity=".4" />
        </svg>
      </div>
    </div>
  )
}
