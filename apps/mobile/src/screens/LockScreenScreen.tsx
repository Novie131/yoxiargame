import { useNavigate } from 'react-router'

import { YoxiMark } from '@/components/icons'
import { RESCUE_SCENARIO } from '@/lib/delayRescue'

/*
 * 對應設計稿 frame：iphone-lockscreen-notification
 *
 * **這一頁是示範畫面，不是真的推播。** 網頁收不到 iOS 的鎖定畫面通知，
 * 所以這裡用一整頁畫出「iPhone 鎖定畫面上跳出 yoxi 通知」的樣子，
 * 讓 demo 能從「使用者還沒打開 App」這個時間點開始講。
 * 真正上架後，這一步由 Capacitor 的推播接手，點通知一樣是開 /rescue。
 *
 * 時間是劇本的（lib/delayRescue），日期用今天：
 * 時間要早於「原本 08:45 抵達」故事才說得通，日期寫死反而會讓人以為是舊截圖。
 *
 * 這一頁掛在 AppShell 外面（見 App.tsx）：鎖定畫面沒有 App 的狀態列與 tab bar，
 * 留著的話一眼就穿幫。
 */

/* 臺北時間的「10月11日 星期六」 */
function todayLabel(): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
}

export function LockScreenScreen() {
  const navigate = useNavigate()
  const { lockscreenTime, savedMinutes, train, delayMinutes } = RESCUE_SCENARIO

  return (
    <div className="h-full bg-surface-2">
      <div
        className="safe-top safe-bottom safe-x relative mx-auto flex h-full w-full max-w-shell flex-col overflow-hidden text-white"
        /* 桌布：品牌色系的晨光漸層，只用既有 token */
        style={{
          background:
            'linear-gradient(165deg, var(--color-ink) 0%, var(--color-info) 48%, var(--color-primary-soft) 100%)',
        }}
      >
        <div className="flex flex-col items-center pt-14 [@media(max-height:640px)]:pt-8">
          <span aria-hidden="true" className="text-[15px] opacity-90">
            🔒
          </span>
          <p className="mt-1 text-[17px] font-semibold opacity-90">{todayLabel()}</p>
          {/* 鎖定畫面的大時間。字重壓細一點，跟 iOS 的樣子比較像 */}
          <p className="text-[88px] font-light leading-none tracking-tight [@media(max-height:640px)]:text-[72px]">
            {lockscreenTime}
          </p>
        </div>

        <div className="mt-8 px-3 [@media(max-height:640px)]:mt-6">
          {/*
            * 整張通知就是一顆按鈕：鎖定畫面上點通知本來就是整張都能點。
            * 毛玻璃用白色半透明疊在漸層上，不另外定義顏色。
            */}
          <button
            type="button"
            onClick={() => navigate('/rescue')}
            aria-label={`yoxi 通知，現在：叫車救援可節省 ${savedMinutes} 分鐘抵達。點一下查看`}
            className="flex w-full items-start gap-3 rounded-[22px] bg-surface/75 px-3.5 py-3 text-left text-ink shadow-[0_6px_24px_rgba(22,32,55,.25)] backdrop-blur-xl transition-transform active:scale-[.98]"
          >
            <span
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: 'var(--color-brand-red)' }}
            >
              <YoxiMark className="h-7 w-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">yoxi</span>
                <span className="shrink-0 text-[13px] text-muted">現在</span>
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold leading-snug">
                ⚡ yoxi 叫車救援可節省 {savedMinutes} 分鐘抵達
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted">
                {train} 誤點 {delayMinutes} 分，點一下查看救援方案
              </span>
            </span>
          </button>
        </div>

        {/* 底部：手電筒與相機（裝飾）、home indicator */}
        <div aria-hidden="true" className="mt-auto flex items-end justify-between px-11 pb-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/30 text-[20px] backdrop-blur">
            🔦
          </span>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/30 text-[20px] backdrop-blur">
            📷
          </span>
        </div>
        <span aria-hidden="true" className="mx-auto mb-2 block h-1.5 w-32 rounded-full bg-white/80" />

        {/* 誠實揭露：這是畫出來的鎖定畫面 */}
        <p className="pb-2 text-center text-[11px] opacity-70">示範畫面：模擬 iPhone 鎖定畫面推播</p>
      </div>
    </div>
  )
}
