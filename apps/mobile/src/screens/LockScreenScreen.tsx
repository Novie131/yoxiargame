import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { RESCUE_SCENARIO, useRescuePlan } from "@/lib/delayRescue";

/*
 * 對應設計稿 frame：iphone-lockscreen-notification
 *
 * **這一頁是示範畫面，不是真的推播。** 網頁收不到 iOS 的鎖定畫面通知，
 * 所以這裡用一整頁畫出「iPhone 鎖定畫面上跳出 yoxi 通知」的樣子，
 * 讓 demo 能從「使用者還沒打開 App」這個時間點開始講。
 * 真正上架後，這一步由 Capacitor 的推播接手，點通知一樣是開 /rescue。
 *
 * 時間與日期都是現在：打開這頁就是推播剛跳出來的那一刻，
 * 誤點後幾點到、叫車能省幾分鐘都從這一刻往後算（lib/delayRescue 的 useRescuePlan）。
 *
 * 這一頁掛在 AppShell 外面（見 App.tsx）：鎖定畫面沒有 App 的狀態列與 tab bar，
 * 留著的話一眼就穿幫。
 *
 * 通知內文照設計稿，但**不放車資與車程**，車資留到 /rescue 的彈窗再講。
 * 「節省幾分鐘」要用到車程，所以這頁也會估價，但只用站名查起訖、不拿定位 ——
 * 在一張假的鎖定畫面上跳定位權限很怪。估價還沒回來時不講數字。
 */

/* 桌布：雨夜窗外的城市光斑。設計稿是照片，這裡用既有色票疊出光斑，不另外引入圖片與色碼 */
const WALLPAPER = [
  "radial-gradient(circle at 18% 30%, color-mix(in srgb, var(--color-primary) 55%, transparent) 0, transparent 22%)",
  "radial-gradient(circle at 82% 22%, color-mix(in srgb, var(--color-info) 70%, transparent) 0, transparent 20%)",
  "radial-gradient(circle at 70% 62%, color-mix(in srgb, var(--color-primary-soft) 45%, transparent) 0, transparent 18%)",
  "radial-gradient(circle at 30% 75%, color-mix(in srgb, var(--color-info) 55%, transparent) 0, transparent 24%)",
  "radial-gradient(circle at 90% 88%, color-mix(in srgb, var(--color-banner-warm-ink) 50%, transparent) 0, transparent 20%)",
  "linear-gradient(180deg, var(--color-ink) 0%, var(--color-ink-2) 55%, var(--color-ink) 100%)",
].join(", ");

/* 狀態列（電信商、訊號、Wi-Fi、電池）。規則同 components/StatusBar：只在桌機預覽時畫 */
function LockStatusBar() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-11 shrink-0 items-center justify-between px-6 text-[15px] font-semibold min-[431px]:flex short:hidden"
    >
      <span>yoxi Mobile</span>
      <span className="flex items-center gap-1.5">
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
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="11"
            rx="3"
            stroke="currentColor"
            opacity=".4"
          />
          <rect
            x="2"
            y="2"
            width="19"
            height="8"
            rx="1.8"
            fill="currentColor"
          />
          <path
            d="M24.5 4.5v3a2 2 0 0 0 0-3Z"
            fill="currentColor"
            opacity=".4"
          />
        </svg>
      </span>
    </div>
  );
}

/* 底部的手電筒與相機。裝飾用，線條圖示 */
function CornerButton({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white/15 bg-ink/45 backdrop-blur">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

/* 臺北時間的「10月11日 星期六」 */
function todayLabel(): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

export function LockScreenScreen() {
  const navigate = useNavigate();
  const { train, delayMinutes } = RESCUE_SCENARIO;
  /* 鎖定畫面是故事的開頭：每次打開都從現在重新起算，/rescue 沿用這個起點 */
  const { trip, clock, savedMinutes } = useRescuePlan({ restart: true });

  return (
    <div className="h-full bg-surface-2">
      <div
        className="safe-top safe-bottom safe-x relative mx-auto flex h-full w-full max-w-shell flex-col overflow-hidden text-white"
        style={{ background: WALLPAPER }}
      >
        <LockStatusBar />

        <div className="flex flex-col items-center pt-12 min-[431px]:pt-4 [@media(max-height:640px)]:pt-6">
          <p className="text-[19px] font-semibold opacity-95">{todayLabel()}</p>
          {/* 鎖定畫面的大時間。字重壓細，跟 iOS 的樣子比較像 */}
          <p className="mt-1 text-[92px] font-extralight leading-none tracking-tight [@media(max-height:640px)]:text-[72px]">
            {clock.notifiedAt}
          </p>
        </div>

        <div className="mt-10 px-3 [@media(max-height:640px)]:mt-6">
          {/*
           * 整張通知就是一顆按鈕：鎖定畫面上點通知本來就是整張都能點。
           * 毛玻璃用白色半透明疊在桌布上，不另外定義顏色。
           */}
          <button
            type="button"
            onClick={() => navigate("/rescue")}
            aria-label={`yoxi 通知，剛剛：通勤路線異常，${train} 車次誤點 ${delayMinutes} 分鐘。點一下查看救援方案`}
            className="block w-full rounded-[24px] border border-white/15 bg-surface/20 px-3.5 pb-3.5 pt-3 text-left shadow-[0_8px_30px_rgba(22,32,55,.35)] backdrop-blur-2xl transition-transform active:scale-[.98]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[14px] font-bold leading-none text-white"
                  style={{ background: "var(--color-brand-red)" }}
                >
                  y
                </span>
                <span className="text-[14px] tracking-wide text-white/65">
                  YOXI
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-white/60">剛剛</span>
            </span>
            <span className="mt-2 block text-[15px] font-bold leading-snug">
              <span aria-hidden="true">⚠ </span>通勤路線異常：{train} 車次誤點{" "}
              {delayMinutes} 分鐘
            </span>
            <span className="mt-1 block text-[14px] leading-relaxed text-white/90">
              您的常用路線「{trip.from}→{trip.to}」受影響，預計延誤至{" "}
              {clock.delayedArrival} 抵達。
              {savedMinutes !== null && savedMinutes <= 0
                ? "目前路況改搭叫車也不會比較快，點開看看其他安排。"
                : "改搭 yoxi 即時叫車可提早抵達。"}
            </span>
            {savedMinutes !== null && savedMinutes > 0 && (
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-success/50 bg-success/35 px-2.5 py-1 text-[12px] font-bold text-success-tint">
                <span aria-hidden="true">⚡</span>
                yoxi 叫車救援可節省 {savedMinutes} 分鐘抵達
              </span>
            )}
          </button>
        </div>

        {/* 底部：手電筒與相機（裝飾）、解鎖提示、home indicator */}
        <div
          aria-hidden="true"
          className="mt-auto flex items-end justify-between px-11 pb-5"
        >
          <CornerButton>
            <path d="M8 3.5h8v3l-1.5 3v10a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-10L8 6.5z" />
            <path d="M8 6.5h8M12 12.5v2" />
          </CornerButton>
          <CornerButton>
            <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.2L9.2 5h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
            <circle cx="12" cy="12.8" r="3.3" />
          </CornerButton>
        </div>
        <p aria-hidden="true" className="text-center text-[15px] text-white/60">
          向上輕掃以解鎖
        </p>
        <span
          aria-hidden="true"
          className="mx-auto mb-1.5 mt-4 block h-1.5 w-32 rounded-full bg-white/80"
        />

        {/* 誠實揭露：這是畫出來的鎖定畫面 */}
        <p className="pb-2 text-center text-[10px] opacity-50">
          示範畫面：模擬 iPhone 鎖定畫面推播
        </p>
      </div>
    </div>
  );
}
