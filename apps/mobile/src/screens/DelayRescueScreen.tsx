import { useState } from "react";
import { useNavigate } from "react-router";

import { ChatComposer } from "@/components/ChatComposer";
import { AssistantMessage } from "@/components/chat";
import { HomeHeader } from "@/components/HomeHeader";
import { Modal } from "@/components/Modal";
import { SituationBanner } from "@/components/SituationBanner";
import { TransportCard } from "@/components/TransportCard";
import { ClockIcon } from "@/components/icons";
import { useCommuteRoute } from "@/lib/commute";
import { RESCUE_SCENARIO, rescueRideUrl, rescueRoute } from "@/lib/delayRescue";
import { FALLBACK_LABEL, useUserLocation } from "@/lib/location";
import {
  formatFare,
  markNextRideAsRescue,
  useResolvedPlace,
  useRideEstimate,
  type RidePlace,
} from "@/lib/ride";

/*
 * 對應設計稿 frame：delay-rescue-modal
 *
 * 跟雨天、紫外線兩頁一樣是**腳本化的情境還原**：底下的首頁與對話照劇本寫死，
 * 台鐵誤點的班次與時間來自 lib/delayRescue（目前沒有台鐵即時資料，見那邊的說明）。
 *
 * 但兩件事是真的：
 *   車資      跟估價頁同一組 hook 與快取，所以按下去之後看到的是同一個數字
 *   主按鈕    進真的叫車流程，並把這一趟標記為救援，最後的結算頁會顯示救援版
 *
 * 一進來就打開彈窗，因為這一頁是從鎖定畫面的推播點進來的 ——
 * 推播的用途就是把這個決定直接擺到使用者面前。
 * 按「暫時不需要」關掉之後，對話裡的卡片可以再叫出來，demo 才走得回去。
 */

/* ── 彈窗用的圖示：只有這頁用到，線條跟著文字色走 ── */

/* 標題上的火車圖示，右上角掛一個警示角標 */
function TrainAlertBadge() {
  return (
    <span className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full bg-primary-tint text-primary">
      <svg
        viewBox="0 0 24 24"
        width="36"
        height="36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="3.5" width="12" height="13" rx="4.5" />
        <path d="M6 10.5h12M9.5 13.5h.01M14.5 13.5h.01M9 16.5 7 20.5M15 16.5l2 4" />
      </svg>
      <span className="absolute -right-1 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-white">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4 2.5 20h19L12 4Z" />
          <path d="M12 10v4m0 2.6h.01" />
        </svg>
      </span>
    </span>
  );
}

function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h15m-5-5 5 5-5 5" />
    </svg>
  );
}

function CarGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 15.5v-3l2-4.5h13l2 4.5v3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
      <path d="M3.5 12.5h17" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </svg>
  );
}

export function DelayRescueScreen() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { route } = useCommuteRoute();
  const trip = rescueRoute(route);

  /*
   * 起訖的解析方式與估價頁一模一樣（含「查不到上車點就用目前位置」的退路），
   * 座標相同，useRideEstimate 就會命中同一份快取 —— 彈窗與估價頁的車資才會一致。
   */
  const location = useUserLocation();
  const here: RidePlace = {
    label:
      location.label ??
      (location.precise ? "目前位置" : `${FALLBACK_LABEL}（預設位置）`),
    lat: location.lat,
    lon: location.lon,
  };
  const pickupState = useResolvedPlace(trip.from, null, null, here);
  const dropoffState = useResolvedPlace(trip.to, null, null);
  const pickup = pickupState.status === "ready" ? pickupState.place : null;
  const dropoff = dropoffState.status === "ready" ? dropoffState.place : null;
  const estimate = useRideEstimate(pickup, dropoff);

  const rescue = () => {
    markNextRideAsRescue();
    navigate(rescueRideUrl(trip));
  };

  const {
    train,
    delayMinutes,
    scheduledArrival,
    delayedArrival,
    savedMinutes,
  } = RESCUE_SCENARIO;

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--color-page-warm)" }}
    >
      <HomeHeader
        greeting="早安，小婷"
        location="新北市板橋區 24°C"
        /*
         * 右上的提示卡只有天氣圖示可選（太陽／雨），配在「誤點」旁邊很怪。
         * 誤點的訊息交給下面的橫幅講，這裡就不放卡。
         */
        alert={null}
      />

      <SituationBanner tone="warm" icon="⏱">
        {train} 目前誤點約 {delayMinutes} 分鐘，預計 {delayedArrival}{" "}
        才會抵達公司。
      </SituationBanner>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AssistantMessage card time={`${RESCUE_SCENARIO.lockscreenTime} AM`}>
          小婷，您今天搭的 {train} 誤點了 {delayMinutes}{" "}
          分鐘，照這樣會比平常晚到公司。 改搭 yoxi 叫車，預計可以早{" "}
          {savedMinutes} 分鐘抵達。
          <TransportCard
            chip="⏱ 延誤救援"
            badge="省時救援"
            badgeIcon={<span aria-hidden="true">⚡</span>}
            title={`${trip.from} → ${trip.to}`}
            cta="查看救援方案"
            onCta={() => setOpen(true)}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <ClockIcon />
                節省 {savedMinutes} 分鐘
              </span>
              <span className="whitespace-nowrap">
                車資於下一頁依實際距離估算
              </span>
            </div>
          </TransportCard>
        </AssistantMessage>
      </div>

      <ChatComposer />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="您的通勤路線有異常！"
        icon={<TrainAlertBadge />}
      >
        <p className="mt-2 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-3 py-1 text-[14px] font-bold text-banner-warm-ink">
            <span aria-hidden="true">⚠</span>
            {train} 車次 預計誤點 {delayMinutes} 分鐘
          </span>
        </p>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-muted">
          根據您的常用路線設定，{RESCUE_SCENARIO.operator}
          誤點將會影響您的交通時間
        </p>

        {/* 路線與時間對比：原本的時間劃掉，讓「晚了多少」一眼看得出來 */}
        <div className="mt-4 rounded-2xl bg-surface-2 px-4">
          <div className="flex items-center justify-between gap-3 border-b border-black/[.07] py-3 text-[17px] font-bold">
            <span className="min-w-0 truncate">{trip.from}</span>
            <span aria-hidden="true" className="shrink-0 text-subtle">
              <ArrowGlyph />
            </span>
            <span className="sr-only">到</span>
            <span className="min-w-0 truncate text-right">{trip.to}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-[13px] text-muted">預計抵達時間</span>
            <span className="flex items-baseline gap-2">
              <span className="sr-only">原本</span>
              <span className="text-[14px] text-subtle line-through">
                {scheduledArrival}
              </span>
              <span className="sr-only">，誤點後</span>
              <span className="text-[19px] font-bold text-primary">
                {delayedArrival}
              </span>
            </span>
          </div>
        </div>

        <p className="mt-4 text-[13px] font-bold text-muted">
          YOXI 推薦通勤救援方案
        </p>

        {/* 推薦方案：主色淡底 + 主色框（同對話裡的交通建議卡） */}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border-[1.5px] border-primary bg-primary-tint px-3 py-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white"
          >
            <CarGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="text-[16px] font-bold">yoxi 即時叫車</p>
              <span className="shrink-0 rounded-md bg-success-tint px-2 py-0.5 text-[12px] font-bold text-success">
                節省 {savedMinutes} 分鐘
              </span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[14px] text-muted">
              {estimate.status === "ready" ? (
                <>
                  <span className="whitespace-nowrap">
                    車程約 {estimate.data.durationMinutes} 分鐘
                  </span>
                  <span aria-hidden="true">•</span>
                  <span className="whitespace-nowrap font-bold text-primary">
                    {formatFare(estimate.data.fare)}
                  </span>
                </>
              ) : (
                <span>車資估算中…</span>
              )}
            </p>
          </div>
        </div>
        {/*
         * 車資的來源一定要跟著數字一起出現（同估價頁）。
         * 估不出來就照實說、交給下一頁，不要退回設計稿的 NT$185。
         */}
        <p className="mt-1.5 text-center text-[11px] text-subtle">
          {estimate.status === "ready"
            ? estimate.data.basis
            : estimate.status === "error" ||
                pickupState.status === "none" ||
                dropoffState.status === "none"
              ? "車資暫時估不出來，下一頁會再估一次"
              : "依臺北市公告計程車費率估算"}
        </p>

        {/* 瀏覽器預設的藍色焦點框不在這套配色裡，改成只在鍵盤操作時出現的主色光圈（同 TabBar） */}
        <button
          type="button"
          onClick={rescue}
          className="mt-3 w-full rounded-full bg-primary py-3.5 text-[17px] font-bold text-white outline-none transition-transform focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[.98]"
        >
          立即叫車救援
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-1 min-h-11 w-full rounded-xl py-2.5 text-[15px] font-semibold text-muted underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-ink/15"
        >
          暫時不需要
        </button>
      </Modal>
    </div>
  );
}
