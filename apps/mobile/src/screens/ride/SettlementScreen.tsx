import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { ChevronLeftIcon } from '@/components/icons'
import { RESCUE_SCENARIO } from '@/lib/delayRescue'
import {
  clearCompletedRide,
  endRide,
  useActiveRide,
  useCompletedRide,
  type RideEstimate,
} from '@/lib/ride'
import { YOXI_PASSENGER_LINK } from '@/lib/yoxiHandoff'

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
const BASE_FARE = 85
const NIGHT_SURCHARGE = 20

/* 示範用的折抵。沒有會員資料，金額照設計稿的量級給 */
const DEMO_COUPON = 30
const DEMO_POINTS = 20

/*
 * 沒有行程可以結算時的示範值。
 * 時間配合救援劇本：原本 09:10 才會到，叫車 08:48 抵達，剛好早 22 分鐘。
 */
const DEMO_TRIP = {
  pickup: '住家',
  dropoff: '公司',
  distanceKm: 6.2,
  durationMinutes: 25,
  start: '08:23',
  end: '08:48',
  fare: { min: 185, max: 215 },
  night: false,
  carType: '轎車',
  driver: '陳建宏・TDA-8899',
  basis: '示範數值：目前沒有剛結束的行程',
}

type Trip = typeof DEMO_TRIP

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
  )
}

/* 臺北時間的 HH:MM */
function hhmm(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at))
}

/* 跳表是 5 元一跳，拆出來的每一行也取整到 5 元 */
const round5 = (n: number) => Math.round(n / 5) * 5

/*
 * 把估價區間拆成明細。
 *
 * 結算金額取區間中點：下界是一路順暢、上界是三成時間在塞，
 * 真實的一趟落在中間。取中點也保證合計不會超出前面估價頁說過的範圍 ——
 * 結算比估價上限還貴，使用者會覺得被騙。
 *
 * 臺北市公告費率沒有「尖峰加成」，尖峰的影響是多出來的延滯計時；
 * 設計稿有這一行，所以保留它並照實顯示 0，夜間則換成夜間加成。
 */
function breakdown(fare: { min: number; max: number }, night: boolean) {
  const nightFee = night ? NIGHT_SURCHARGE : 0
  const meter = Math.max(0, fare.min - nightFee)
  const base = Math.min(BASE_FARE, meter)
  const distance = meter - base
  const wait = Math.max(0, round5((fare.max - fare.min) / 2))
  const subtotal = base + distance + wait + nightFee
  /* 折抵不能把合計扣成負的 */
  const coupon = Math.min(DEMO_COUPON, subtotal)
  const points = Math.min(DEMO_POINTS, subtotal - coupon)
  return { base, distance, wait, nightFee, coupon, points, total: subtotal - coupon - points }
}

const money = (n: number) => `NT$${n}`

function Row({
  label,
  note,
  value,
  discount,
}: {
  label: string
  note?: string
  value: number
  discount?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[14px]">{label}</p>
        {note && <p className="text-[11px] text-subtle">{note}</p>}
      </div>
      <p className={`shrink-0 text-[14px] font-semibold ${discount ? 'text-success' : ''}`}>
        {discount ? `-${money(value)}` : money(value)}
      </p>
    </div>
  )
}

function CheckBadge() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
        <path
          d="m5.5 12.5 4.2 4.2L18.5 8"
          stroke="var(--color-surface)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function SettlementScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const completed = useCompletedRide()
  const active = useActiveRide()
  /* 沒有完成時間（還在進行中就被帶來這頁）時，用進來這一刻當抵達時間 */
  const [openedAt] = useState(() => Date.now())

  /*
   * 優先讀「剛完成的那一趟」；行程頁若只換了導向、沒呼叫 completeRide，
   * 就退一步讀還在進行中的那趟，兩種接法都不會掉到示範值。
   */
  const ride = completed ?? active
  const endAt = completed?.completedAt ?? openedAt

  const trip: Trip =
    ride && usable(ride.estimate)
      ? {
          pickup: ride.pickup.label,
          dropoff: ride.dropoff.label,
          distanceKm: ride.estimate.distanceKm,
          durationMinutes: ride.estimate.durationMinutes,
          start: hhmm(endAt - ride.estimate.durationMinutes * 60_000),
          end: hhmm(endAt),
          fare: ride.estimate.fare,
          night: ride.estimate.nightSurcharge,
          carType: ride.carType,
          driver: `${ride.driver.name}・${ride.driver.plate}`,
          basis: ride.estimate.basis,
        }
      : DEMO_TRIP

  const rescue = params.get('rescue') === '1' || ride?.rescue === true
  const bill = breakdown(trip.fare, trip.night)

  const done = () => {
    if (active) endRide()
    clearCompletedRide()
    navigate('/')
  }

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex-1 overflow-y-auto">
        {rescue && (
          <div className="flex items-center gap-2 bg-success-tint px-5 py-3 text-[14px] font-semibold text-success">
            <span aria-hidden="true">⏱</span>
            <p>
              比{RESCUE_SCENARIO.operator}延誤提早 {RESCUE_SCENARIO.savedMinutes} 分鐘抵達
            </p>
          </div>
        )}

        <div className="space-y-3 px-4 pb-4 pt-4">
          {/* 成功橫幅 */}
          <section className="flex items-center gap-3 rounded-card bg-surface px-4 py-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]">
            <CheckBadge />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-bold">行程完成</h1>
                {rescue && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    延誤救援
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-muted">
                {trip.end} 抵達{trip.dropoff}，感謝搭乘 yoxi
              </p>
            </div>
          </section>

          {/* 行程：起訖、時間、里程 */}
          <section className="rounded-card bg-surface px-4 py-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]">
            <div className="relative space-y-3">
              <span aria-hidden="true" className="absolute left-[4px] top-4 h-6 w-px bg-line" />
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                <p className="min-w-0 truncate text-[15px] font-semibold">
                  <span className="sr-only">上車：</span>
                  {trip.pickup}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <p className="min-w-0 truncate text-[15px] font-semibold">
                  <span className="sr-only">下車：</span>
                  {trip.dropoff}
                </p>
              </div>
            </div>

            {/* 三格在 320 寬也放得下：時間那格最長，給它多一點寬 */}
            <dl className="mt-3 grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-t border-black/[.06] pt-3">
              <div>
                <dt className="text-[11px] text-subtle">行程時間</dt>
                <dd className="mt-0.5 whitespace-nowrap text-[14px] font-bold">
                  {trip.start}–{trip.end}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-subtle">車程</dt>
                <dd className="mt-0.5 whitespace-nowrap text-[14px] font-bold">
                  {trip.durationMinutes} 分鐘
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-subtle">里程</dt>
                <dd className="mt-0.5 whitespace-nowrap text-[14px] font-bold">
                  {trip.distanceKm} 公里
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[12px] text-subtle">
              {trip.carType}・{trip.driver}（模擬派車）
            </p>
          </section>

          {/* 費用明細 */}
          <section className="rounded-card bg-surface px-4 py-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]">
            <h2 className="mb-1 text-[15px] font-bold">費用明細</h2>
            <Row label="起步價" note="含前 1.25 公里" value={bill.base} />
            <Row label="里程費" value={bill.distance} />
            <Row label="延滯計時" note="停等與低速行駛" value={bill.wait} />
            {trip.night ? (
              <Row label="夜間加成" note="23:00–06:00 每趟" value={bill.nightFee} />
            ) : (
              <Row label="尖峰加成" note="公告費率無尖峰加成" value={0} />
            )}
            <Row label="優惠券折抵" value={bill.coupon} discount />
            <Row label="和泰點數折抵" note={`使用 ${bill.points} 點`} value={bill.points} discount />
            <div className="mt-2 flex items-baseline justify-between border-t border-black/[.06] pt-3">
              <p className="text-[15px] font-bold">合計</p>
              <p className="text-[24px] font-bold text-primary">{money(bill.total)}</p>
            </div>
            {/*
              * 兩件事都要講：車資是估算、折抵是示範。
              * 寫法跟叫車流程其他頁一致（來源原文照抄，不改寫成「預估車資」了事）。
              */}
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              {trip.basis}・優惠券、和泰點數、付款與發票資訊為示範，尚未串接會員帳戶
            </p>
          </section>

          {/* 付款與發票 */}
          <section className="divide-y divide-black/[.06] rounded-card bg-surface px-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]">
            <div className="flex items-center justify-between gap-3 py-3.5">
              <p className="text-[14px] text-muted">付款方式</p>
              <p className="text-[14px] font-semibold">信用卡 •••• 1234</p>
            </div>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <p className="shrink-0 text-[14px] text-muted">電子發票</p>
              <p className="min-w-0 truncate text-right text-[14px] font-semibold">
                手機條碼載具 /ABC1234
              </p>
            </div>
            {/*
              * 遺失物協尋交給真的 yoxi App：這個原型沒有司機聯絡管道，
              * 在這裡做一個假的表單，使用者會以為東西已經有人在找了。
              */}
            <a
              href={YOXI_PASSENGER_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-between gap-3 py-3.5"
            >
              <span>
                <span className="block text-[14px] font-semibold">遺失物協尋</span>
                <span className="block text-[11px] text-subtle">開啟 yoxi App 聯絡客服</span>
              </span>
              <ChevronLeftIcon className="h-5 w-5 shrink-0 rotate-180" />
            </a>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/5 bg-surface px-4 py-3">
        <button
          type="button"
          onClick={done}
          className="w-full rounded-xl bg-primary py-3.5 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
        >
          確認並完成行程
        </button>
      </div>
    </div>
  )
}
