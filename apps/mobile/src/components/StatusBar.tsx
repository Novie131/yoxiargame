import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'

function formatNow() {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/* 對齊到下一個整分再開始每分鐘跳一次，避免顯示的分鐘落後真實時間最多 59 秒 */
function useClock() {
  const [now, setNow] = useState(formatNow)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setNow(formatNow())
      interval = setInterval(() => setNow(formatNow()), 60_000)
    }, 60_000 - (Date.now() % 60_000))

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  return now
}

/*
 * 桌機瀏覽器預覽時畫一條假狀態列，讓畫面跟設計稿對得起來。
 *
 * 不渲染的兩種情況：
 * 1. 真機（Capacitor）—— 系統本來就有狀態列，會疊兩層。
 * 2. 視窗寬度 ≤ 430px（手機瀏覽器）—— 手機殼已經滿版，上面又有系統狀態列
 *    和瀏覽器網址列，再加一條假的只是白白吃掉一整條高度。用 CSS breakpoint
 *    判斷，轉螢幕、縮視窗都會即時跟著變，不必自己監聽 resize。
 *
 * time 只在要跟設計稿逐張比對時才傳（設計稿是 14:10 那種固定值），
 * 平常留空就顯示裝置的真實時間。
 */
export function StatusBar({ time }: { time?: string }) {
  const now = useClock()
  if (Capacitor.isNativePlatform()) return null

  return (
    <div className="hidden h-11 shrink-0 items-center justify-between px-6 text-[15px] font-semibold text-ink min-[431px]:flex">
      <span>{time ?? now}</span>
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
