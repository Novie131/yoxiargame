import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ChevronLeftIcon } from "@/components/icons";
import { RESCUE_SCENARIO } from "@/lib/delayRescue";
import {
  clearCompletedRide,
  DEMO_COUPON,
  endRide,
  useActiveRide,
  useCompletedRide,
  type RideEstimate,
} from "@/lib/ride";
import { YOXI_PASSENGER_LINK } from "@/lib/yoxiHandoff";

/*
 * 對應設計稿 frame：yoxi-fare-settlement（叫車 ⑤／車資結算）
 * 以及它的變體 fare-settlement-delay-rescue（延誤救援版）。
 *
 * 兩張稿是同一頁：救援版只多了頂部「比台鐵提早抵達」的橫幅與「延誤救援」標籤，
 * 所以用同一個元件、靠一個布林切換，不複製一整頁。
 * 救援與否看兩個地方（任一成立即可）：
 *   這一趟本身的標記  從救援彈窗叫的車（lib/ride 的 markNextRideAsRescue）
 *   網址 ?rescue=1    原型導覽直接開救援版用
 *
 * ── 數字從哪來 ──
 *
 *   里程、車程、車資   剛結束那一趟的估價（lib/ride 的 completeRide 留下的快照）。
 *                     依臺北市公告費率**估算**，不是跳表金額，畫面上要講
 *   優惠券、和泰點數    **示範**。還沒有會員帳戶可以查，畫面上要講
 *   付款方式、發票載具  **示範**，理由同上
 *
 * 直接打開網址（沒有剛結束的行程）時，整頁改用一組固定的示範值，並且標示出來 ——
 * 不能白屏，也不能出現 NaN。
 */

/*
 * 費率常數，跟後端 apps/api/src/services/ride.ts 的 TARIFF 同一組公告值。
 * 估價只回總額區間不回明細，結算頁要拆成幾行就得知道起程價與夜間加成是多少。
 * 公告費率調整時兩邊要一起改。
 */
const BASE_FARE = 85;
const NIGHT_SURCHARGE = 20;

/* 示範用的點數回饋：每 NT$2 回饋 1 點（設計稿 NT$240 → +120 點的比例） */
const DEMO_POINTS_PER_DOLLAR = 0.5;

/*
 * 沒有行程可以結算時的示範值。
 * 時間配合救援劇本：原本 09:10 才會到，叫車 08:48 抵達，剛好早 22 分鐘。
 */
const DEMO_TRIP = {
  pickup: "住家",
  dropoff: "公司",
  distanceKm: 6.2,
  durationMinutes: 25,
  start: "08:23",
  fare: { min: 185, max: 215 },
  night: false,
  basis: "示範數值：目前沒有剛結束的行程",
};

type Trip = typeof DEMO_TRIP;

/* 估價的每個數字都要是正常的數，舊版或壞掉的快照就退回示範值 */
function usable(e: RideEstimate | undefined): e is RideEstimate {
  return (
    !!e &&
    Number.isFinite(e.distanceKm) &&
    Number.isFinite(e.durationMinutes) &&
    Number.isFinite(e.fare?.min) &&
    Number.isFinite(e.fare?.max) &&
    e.fare.min > 0 &&
    e.fare.max >= e.fare.min
  );
}

/* 臺北時間的 HH:MM */
function hhmm(at: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(at));
}

/* 臺北時間的 YYYY/MM/DD（設計稿的寫法），用 parts 組才不受語系的順序影響 */
function ymd(at: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")}`;
}

/* 跳表是 5 元一跳，拆出來的每一行也取整到 5 元 */
const round5 = (n: number) => Math.round(n / 5) * 5;

/*
 * 把估價區間拆成明細。
 *
 * 結算金額取區間中點：下界是一路順暢、上界是三成時間在塞，
 * 真實的一趟落在中間。取中點也保證合計不會超出前面估價頁說過的範圍 ——
 * 結算比估價上限還貴，使用者會覺得被騙。
 *
 * 行的分法照設計稿：起程＋里程合成「起步與車資」、多出來的延滯計時是「續程及延滯」。
 * 臺北市公告費率沒有「尖峰加成」，尖峰的影響是多出來的延滯計時；
 * 設計稿有這一行，所以保留它並照實顯示 0，夜間則換成夜間加成。
 * 和泰點數在設計稿是「獲得」不是折抵，不從總額扣。
 */
function breakdown(fare: { min: number; max: number }, night: boolean) {
  const nightFee = night ? NIGHT_SURCHARGE : 0;
  const meter = Math.max(0, fare.min - nightFee);
  const wait = Math.max(0, round5((fare.max - fare.min) / 2));
  const subtotal = meter + wait + nightFee;
  /* 折抵不能把合計扣成負的 */
  const coupon = Math.min(DEMO_COUPON, subtotal);
  const total = subtotal - coupon;
  return {
    meter,
    wait,
    nightFee,
    coupon,
    total,
    points: Math.floor(total * DEMO_POINTS_PER_DOLLAR),
  };
}

const money = (n: number) => `NT$ ${n}`;

/* 卡片的共用外框：白底、細框、極淡的陰影 */
const CARD =
  "rounded-card border border-black/[.07] bg-surface shadow-[0_1px_4px_rgba(22,32,55,.04)]";

function Row({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-[7px]">
      <div
        className={`min-w-0 text-[14px] ${tone ? "text-success" : "text-muted"}`}
      >
        {label}
      </div>
      <p
        className={`shrink-0 text-[14px] font-semibold ${tone ? "text-success" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/* ── 圖示：只有這頁用到，線條跟著文字色走 ── */

function Svg({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const CalendarGlyph = () => (
  <Svg className="h-[18px] w-[18px]">
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v3.5m7-3.5v3.5" />
  </Svg>
);
const CardGlyph = () => (
  <Svg>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </Svg>
);
const ReceiptGlyph = () => (
  <Svg>
    <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
  </Svg>
);
const HelpGlyph = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8h.01" />
  </Svg>
);
const HeadsetGlyph = () => (
  <Svg>
    <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
    <rect x="4" y="13.5" width="4" height="6" rx="1.5" />
    <rect x="16" y="13.5" width="4" height="6" rx="1.5" />
  </Svg>
);

function CheckBadge() {
  return (
    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-success-tint text-success">
      <Svg className="h-[30px] w-[30px]">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.3 12.2 2.6 2.6 5-5.2" />
      </Svg>
    </span>
  );
}

export function SettlementScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const completed = useCompletedRide();
  const active = useActiveRide();
  /* 沒有完成時間（還在進行中就被帶來這頁）時，用進來這一刻當抵達時間 */
  const [openedAt] = useState(() => Date.now());

  /*
   * 優先讀「剛完成的那一趟」；行程頁若只換了導向、沒呼叫 completeRide，
   * 就退一步讀還在進行中的那趟，兩種接法都不會掉到示範值。
   */
  const ride = completed ?? active;

  const real = ride && usable(ride.estimate) ? ride : null;
  /*
   * 上車時間用叫車那一刻，不用「完成時間 − 車程」倒推：示範行程是加速播放的
   * （lib/ride 的 DEMO_SPEEDUP），倒推會推到叫車之前 —— 救援情境裡甚至早於誤點推播。
   */
  const startAt = real ? real.bookedAt : openedAt;
  const trip: Trip = real
    ? {
        pickup: real.pickup.label,
        dropoff: real.dropoff.label,
        distanceKm: real.estimate.distanceKm,
        durationMinutes: real.estimate.durationMinutes,
        start: hhmm(startAt),
        fare: real.estimate.fare,
        night: real.estimate.nightSurcharge,
        basis: real.estimate.basis,
      }
    : DEMO_TRIP;
  /* 上車那一刻的日期；示範值沒有日期，用今天 */
  const startDate = ymd(startAt);

  const rescue = params.get("rescue") === "1" || ride?.rescue === true;
  /*
   * 救援版橫幅的分鐘數是使用者在救援彈窗按下去時看到的那個數字（lib/ride 隨行程存著），
   * 不是寫死的。沒有（?rescue=1 直接開）或叫車其實沒比較快時，就不講數字。
   */
  const rescueSaved =
    ride?.rescueSavedMinutes != null && ride.rescueSavedMinutes > 0
      ? ride.rescueSavedMinutes
      : null;
  const bill = breakdown(trip.fare, trip.night);

  const done = () => {
    if (active) endRide();
    clearCompletedRide();
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex-1 overflow-y-auto">
        {/* 頂部：完成的勾勾與標題，白底，跟下面的灰底內容用一條細線隔開 */}
        <header className="flex flex-col items-center border-b border-black/[.06] bg-surface px-5 pb-5 pt-6 text-center">
          <CheckBadge />
          <h1 className="mt-3 text-[22px] font-bold">行程已安全結束</h1>
          <p className="mt-1 text-[13px] text-muted">
            感謝您搭乘 yoxi，期待再次為您服務
          </p>
        </header>

        <div className="space-y-4 px-4 pb-5 pt-4">
          {rescue && (
            <section className="rounded-card border border-success/30 bg-success-tint px-4 py-3">
              <p className="text-[16px] font-bold text-success">
                <span aria-hidden="true">⏱ </span>
                {rescueSaved !== null
                  ? `比${RESCUE_SCENARIO.operator}延誤提早 ${rescueSaved} 分鐘抵達！`
                  : "延誤救援行程已完成"}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {RESCUE_SCENARIO.train} 車次誤點 {RESCUE_SCENARIO.delayMinutes}{" "}
                分鐘，yoxi 送您抵達目的地
              </p>
            </section>
          )}

          {/* 行程：日期、車程與里程、起訖 */}
          <section className={`${CARD} px-4`}>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-black/[.06] py-3.5">
              <p className="flex items-center gap-1.5 whitespace-nowrap text-[14px] font-medium">
                <span className="text-muted">
                  <CalendarGlyph />
                </span>
                {startDate} {trip.start}
              </p>
              <p className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-primary">
                {trip.durationMinutes} MINS • {trip.distanceKm} KM
                {rescue && (
                  <span className="rounded bg-primary-tint px-1 py-0.5 text-[10px] font-bold">
                    延誤救援
                  </span>
                )}
              </p>
            </div>
            <div className="relative space-y-3 py-3.5">
              <span
                aria-hidden="true"
                className="absolute left-[4px] top-[44px] h-[38px] w-px bg-line"
              />
              <div className="flex items-start gap-3">
                <span className="mt-[18px] h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                <div className="min-w-0">
                  <p className="text-[11px] text-subtle">上車地點</p>
                  <p className="truncate text-[15px] font-semibold">
                    {trip.pickup}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-[18px] h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="text-[11px] text-subtle">下車地點</p>
                  <p className="truncate text-[15px] font-semibold">
                    {trip.dropoff}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 費用明細 */}
          <section className={`${CARD} px-4`}>
            <h2 className="border-b border-black/[.06] py-3.5 text-[16px] font-bold">
              費用明細
            </h2>
            <div className="py-2">
              <Row
                label={`起步與車資 (起步 1.25 km / NT$${BASE_FARE})`}
                value={money(bill.meter)}
              />
              <Row label="續程及延滯計費" value={money(bill.wait)} />
              {trip.night ? (
                <Row label="夜間加成" value={money(bill.nightFee)} />
              ) : (
                <Row label="尖峰時段加成" value={money(0)} />
              )}
              <Row
                tone="success"
                label={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    yoxi 專屬優惠券折抵
                    <span className="rounded bg-success-tint px-1.5 py-px text-[10px] font-bold">
                      -NT${DEMO_COUPON}
                    </span>
                  </span>
                }
                value={`-${money(bill.coupon)}`}
              />
              <Row
                label="獲得和泰點數"
                value={`+${bill.points} 點`}
                tone="success"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-black/[.06] py-3.5">
              <div className="min-w-0">
                <p className="text-[16px] font-bold">應付總額</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  由綁定卡片自動扣款完成
                </p>
              </div>
              <p className="shrink-0 text-[26px] font-extrabold leading-none text-primary">
                {money(bill.total)}
              </p>
            </div>
            {/*
             * 兩件事都要講：車資是估算、折抵與付款是示範。
             * 寫法跟叫車流程其他頁一致（來源原文照抄，不改寫成「預估車資」了事）。
             */}
            <p className="-mt-1 pb-3 text-[11px] leading-relaxed text-subtle">
              {trip.basis}
              {!trip.night && "・公告費率無尖峰加成"}
              ・優惠券、點數、付款與發票為示範，尚未串接會員帳戶
            </p>
          </section>

          {/* 付款與發票 */}
          <section className={`${CARD} divide-y divide-black/[.06] px-4`}>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <p className="flex shrink-0 items-center gap-2.5 text-[15px] font-bold">
                <CardGlyph />
                付款方式
              </p>
              <p className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[14px] text-muted">
                <span className="whitespace-nowrap">Visa (•••• 8899)</span>
                <span className="rounded bg-primary-tint px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  已付款
                </span>
              </p>
            </div>
            {/* 發票明細交給真的 yoxi App，這個原型沒有會員信箱可以查 */}
            <a
              href={YOXI_PASSENGER_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-between gap-3 py-3.5"
            >
              <span className="flex shrink-0 items-center gap-2.5 text-[15px] font-bold">
                <ReceiptGlyph />
                電子發票與收據
              </span>
              <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted">
                <span className="truncate">已寄送至會員信箱</span>
                <ChevronLeftIcon className="h-4 w-4 shrink-0 rotate-180" />
              </span>
            </a>
          </section>

          {/*
           * 遺失物協尋、對行程有疑問都交給真的 yoxi App：這個原型沒有司機與客服的聯絡管道，
           * 在這裡做一個假的表單，使用者會以為東西已經有人在找了。
           */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "遺失物協尋", icon: <HelpGlyph /> },
              { label: "對行程有疑問", icon: <HeadsetGlyph /> },
            ].map(({ label, icon }) => (
              <a
                key={label}
                href={YOXI_PASSENGER_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[.08] bg-surface px-2 py-2.5 text-[14px] font-bold transition-transform active:scale-[.98]"
              >
                {icon}
                <span className="whitespace-nowrap">{label}</span>
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={done}
            className="w-full rounded-xl bg-primary py-3.5 text-[17px] font-bold text-white shadow-md shadow-primary/30 transition-transform active:scale-[.98]"
          >
            確認並完成行程
          </button>
        </div>
      </div>
    </div>
  );
}
