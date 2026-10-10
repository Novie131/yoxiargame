import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import type { MapMarker } from '@/components/Map'
import { MapBackdrop } from '@/components/MapBackdrop'
import { CarIcon, ChevronLeftIcon, CrosshairIcon } from '@/components/icons'
import { FALLBACK_LABEL, requestLocation, useUserLocation } from '@/lib/location'
import {
  formatFare,
  startRide,
  trafficLabel,
  useResolvedPlace,
  useRideEstimate,
  type RidePlace,
} from '@/lib/ride'
import { useRideMapRoute } from '@/lib/rideMap'
import { copyDestination, YOXI_PASSENGER_LINK } from '@/lib/yoxiHandoff'

/*
 * 對應設計稿 frame：yoxi-ride-estimate（叫車 ②／預估車資）。此頁無 tab bar
 *
 * 上下車點與三個數字全部來自上一頁帶過來的座標：
 * 車程與車資由後端依**臺北市公告計程車費率**估算（services/ride.ts），
 * 不是 yoxi 的報價 —— 所以畫面上必須把來源寫出來。
 *
 * 在這之前這三個數字是寫死的（約 15 分鐘 / 14:25 / NT$250-320），
 * 不管使用者要去哪裡都一樣。那比留白更危險：它看起來完全像真的。
 *
 * 探索頁的任務面板按「叫車前往」時會帶著任務名稱與座標過來，
 * 那就是「精準導流」實際落地的地方。
 */

const carTypes = [
  { id: 'sedan', name: '轎車', note: '最快' },
  { id: 'suv', name: 'SUV', note: '寬敞' },
  { id: 'premium', name: '多元車', note: '高級' },
]

export function EstimateScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState('sedan')
  const location = useUserLocation()

  const num = (key: string) => {
    const n = Number(params.get(key))
    return Number.isFinite(n) && n !== 0 ? n : null
  }

  /*
   * 上車點沒帶就用目前定位 —— 從探索頁直接跳進來時只會帶目的地。
   * 名稱同樣不顯示經緯度，那對使用者沒有意義。
   */
  const here: RidePlace = {
    label: location.label ?? (location.precise ? '目前位置' : `${FALLBACK_LABEL}（預設位置）`),
    lat: location.lat,
    lon: location.lon,
  }

  /*
   * 通勤異常通知帶的是站名而沒有座標（見 lib/ride 的 useResolvedPlace），
   * 所以兩端都要能接受「只有地名」的情況。
   */
  const pickupState = useResolvedPlace(
    params.get('from')?.trim() || null,
    num('fromLat'),
    num('fromLon'),
    here,
  )
  const dropoffState = useResolvedPlace(params.get('to')?.trim() || null, num('toLat'), num('toLon'))

  const pickup = pickupState.status === 'ready' ? pickupState.place : here
  const dropoff = dropoffState.status === 'ready' ? dropoffState.place : null
  const resolving = dropoffState.status === 'resolving'

  const estimate = useRideEstimate(pickup, dropoff)

  /*
   * 地圖：上車點 → 目的地的路線，兩點都要在畫面裡（設計稿 yoxi-ride-estimate）。
   * 原本只置中在目的地，上車點常常跑出畫面，看不出這趟是從哪到哪。
   */
  const dropLat = dropoff?.lat
  const dropLon = dropoff?.lon
  const dropLabel = dropoff?.label
  const from = useMemo(() => ({ lng: pickup.lon, lat: pickup.lat }), [pickup.lon, pickup.lat])
  const to = useMemo(
    () => (dropLat !== undefined && dropLon !== undefined ? { lng: dropLon, lat: dropLat } : null),
    [dropLat, dropLon],
  )
  const map = useRideMapRoute(from, to)
  const markers = useMemo<MapMarker[]>(
    () => [
      { id: 'pickup', position: from, label: pickup.label, variant: 'origin' },
      ...(to ? [{ id: 'dropoff', position: to, label: dropLabel, variant: 'destination' as const }] : []),
    ],
    [from, to, pickup.label, dropLabel],
  )

  /*
   * 交棒給真的 yoxi App。
   *
   * 這是這條流程的**主要動作** —— 派車是模擬的，讓使用者以為叫到車了
   * 是整個原型裡唯一會真正害到他的地方。
   *
   * 目的地用剪貼簿帶過去（yoxi 沒有公開 deep link 參數，見 lib/yoxiHandoff）。
   * 複製失敗不擋開啟 —— 少一個便利而已，不是錯誤。
   */
  const [copied, setCopied] = useState(false)

  /*
   * 只負責複製，**不負責開連結** —— 開連結是 <a> 自己的事。
   * 這裡刻意不 await：await 會讓後面的跳轉離開使用者手勢，被瀏覽器擋掉。
   */
  const rememberDestination = () => {
    if (!dropoff) return
    void copyDestination(dropoff.label).then(setCopied)
  }

  /*
   * 模擬流程。留著是因為設計稿的後兩頁（司機前往中、行程進行中）要有地方進，
   * 但它已經不是主要路徑了 —— 降成次要按鈕，而且名字直接寫「模擬」。
   */
  const confirm = () => {
    if (estimate.status !== 'ready' || !dropoff) return
    startRide({
      pickup,
      dropoff,
      estimate: estimate.data,
      carType: carTypes.find((c) => c.id === selected)?.name ?? '轎車',
    })
    navigate('/ride/driver')
  }

  /*
   * 三個數字共用同一個狀態：要嘛都有，要嘛都在載入。
   * 分開處理會出現「車程有了、車資還在轉」那種半成品畫面。
   */
  const stats =
    estimate.status === 'ready'
      ? [
          { label: '預估車程', value: `約 ${estimate.data.durationMinutes} 分鐘` },
          { label: '預估抵達', value: estimate.data.eta },
          { label: '預估車資', value: formatFare(estimate.data.fare), highlight: true },
        ]
      : [
          { label: '預估車程', value: '—' },
          { label: '預估抵達', value: '—' },
          { label: '預估車資', value: '—', highlight: true },
        ]

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop
        center={dropoff ?? pickup}
        markers={markers}
        route={map.route}
        fitBounds={map.fitBounds}
        /* 上車點已經畫成「我的位置」的深色標記，藍點會疊在上面 */
        showUserLocation={false}
      >
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/ride/booking')}
          className="absolute left-4 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <ChevronLeftIcon />
        </button>

        <button
          type="button"
          aria-label="回到目前位置"
          onClick={() => void requestLocation()}
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <CrosshairIcon />
        </button>
      </MapBackdrop>

      <BottomSheet>
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px] font-bold">預估車資</h1>
          {estimate.status === 'ready' && (
            <span className="text-[12px] font-medium text-subtle">
              {trafficLabel(estimate.data.traffic)}
              {estimate.data.nightSurcharge && '・含夜間加成'}
            </span>
          )}
        </div>

        <div className="relative mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5">
          <span className="absolute left-[10px] top-7 h-8 w-px bg-line" />
          <div className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
            <div className="-mt-1 min-w-0">
              <p className="text-[12px] text-subtle">上車地點</p>
              <p className="truncate text-[15px] font-semibold">{pickup.label}</p>
            </div>
          </div>
          <div className="border-t border-black/[.06] pt-3">
            <div className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
              <div className="-mt-1 min-w-0">
                <p className="text-[12px] text-subtle">下車地點</p>
                <p className="truncate text-[15px] font-semibold">
                  {dropoff?.label ?? (resolving ? '查詢中…' : '尚未選擇')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5 max-[359px]:gap-1.5">
          {stats.map(({ label, value, highlight }) => (
            <div
              key={label}
              className={[
                'rounded-xl py-2.5 text-center',
                highlight ? 'border border-primary bg-primary-tint' : 'bg-surface-2',
              ].join(' ')}
            >
              <p className="text-[11px] text-subtle">{label}</p>
              <p
                className={[
                  'mt-0.5 text-[15px] font-bold max-[359px]:text-[13px]',
                  highlight ? 'text-primary' : '',
                ].join(' ')}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/*
          * 數字的來源。這一行不是免責聲明，是這頁唯一誠實的地方 ——
          * 拿掉它，上面那三格就跟接上 yoxi 之後長得一模一樣。
          */}
        {estimate.status === 'ready' && (
          <p className="mt-2 text-center text-[11px] text-subtle">
            {estimate.data.basis}・{estimate.data.distanceKm} 公里
          </p>
        )}
        {estimate.status === 'loading' && dropoff && (
          <p className="mt-2 text-center text-[11px] text-subtle">估算中…</p>
        )}
        {dropoffState.status === 'none' && params.get('to') && (
          <p className="mt-2 text-center text-[11px] text-primary" role="alert">
            查不到「{params.get('to')}」，請回上一頁重新選擇目的地
          </p>
        )}
        {estimate.status === 'error' && (
          <p className="mt-2 text-center text-[11px] text-primary" role="alert">
            估價暫時取不到。沒有數字就不要猜，請稍後再試。
          </p>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2.5 max-[359px]:gap-1.5">
          {carTypes.map(({ id, name, note }) => {
            const on = selected === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={on}
                className={[
                  'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
                  'max-[359px]:gap-1.5 max-[359px]:px-2',
                  on ? 'bg-ink text-white' : 'border border-line/60',
                ].join(' ')}
              >
                <CarIcon active={on} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{name}</span>
                  <span
                    className={['block text-[11px]', on ? 'text-primary-soft' : 'text-subtle'].join(
                      ' ',
                    )}
                  >
                    {note}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/*
          * 設計稿上沒有這顆 CTA（畫面在車型列之後就結束了）。
          *
          * 主要動作是**開啟 yoxi App**，不是走完我們自己的模擬流程：
          * 上面那三個數字是真的（依公告費率實算），但派車不是，
          * 讓人以為叫到車了是這條流程唯一會真正害到他的地方。
          */}
        {/*
          * ── 為什麼主要動作是模擬流程，而不是交棒給 yoxi ──
          *
          * 交棒那條路是對的，但它**不適合當 demo 的主線**：
          *   觀眾手機不一定裝了 yoxi，當場會變成下載頁
          *   iOS 一旦記住「在 Safari 開啟」就會靜默停用該網域的 App 跳轉，
          *   前一晚測好、隔天現場失效
          *   而且 yoxi 沒有公開 deep link 參數，跳過去也帶不了目的地
          *
          * 所以主線用自成一體的模擬流程，交棒降成次要入口留著說明「正式版怎麼走」。
          * 拿到官方參數之後再把主次對調。
          *
          * 但主線是模擬的這件事**必須寫在按鈕旁邊**，不是只寫在下一頁 ——
          * 使用者是在按下去之前需要知道，不是按下去之後。
          */}
        <button
          type="button"
          onClick={confirm}
          disabled={estimate.status !== 'ready' || !dropoff}
          className="mt-3 w-full rounded-xl bg-primary py-4 text-[17px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-45"
        >
          {dropoff ? '確認叫車' : resolving ? '查詢地點中…' : '請先選擇目的地'}
        </button>
        <p className="mt-2 text-center text-[11px] text-subtle">
          示範流程：派車與司機為模擬，不會真的叫到車
        </p>

        {/*
          * 交棒給真的 yoxi App。
          *
          * 這裡**必須**是真的 <a>，不能是 button + window.open：
          * iOS 只在「使用者真的點了一個 <a href>」時才會把 universal link
          * 交給 App 處理，用 JS 開的會直接在 Safari 裡打開那一頁，
          * 看起來就是「按了沒跳轉」（實機踩過，見 lib/yoxiHandoff 的註解）。
          */}
        {dropoff && (
          <>
            <a
              href={YOXI_PASSENGER_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={rememberDestination}
              className="mt-2 block w-full rounded-xl border border-line/60 py-3 text-center text-[15px] font-semibold text-ink transition-transform active:scale-[.98]"
            >
              改用 yoxi App 叫車
            </a>
            <p className="mt-1.5 text-center text-[11px] text-subtle">
              {copied
                ? `已複製「${dropoff.label}」，在 yoxi 搜尋框貼上即可`
                : '開啟 yoxi App（未安裝則前往官方下載頁）'}
            </p>
          </>
        )}
      </BottomSheet>
    </div>
  )
}
