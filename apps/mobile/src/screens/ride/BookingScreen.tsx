import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  CrosshairIcon,
  HomeIcon,
  PencilIcon,
  PlaneIcon,
  SearchIcon,
  StarIcon,
} from '@/components/icons'
import { useCommuteRoute } from '@/lib/commute'
import {
  FALLBACK_LABEL,
  lookupPlace,
  requestLocation,
  useLocationState,
} from '@/lib/location'
import type { RidePlace } from '@/lib/ride'
import { useTrips } from '@/lib/trips'

/*
 * 對應設計稿 frame：yoxi-booking（叫車 ①／選上車點）
 *
 * 這頁原本整頁是靜態的：搜尋框按不動、三顆快捷鍵沒有行為、上車點寫死成
 * 「大安區新生南路三段22巷2-3號」，按「呼叫 yoxi」直接跳到估價頁 ——
 * 而估價頁顯示的又是另一個不相干的地點。
 *
 * 現在上車點來自真實定位，下車點是使用者查出來的，兩者都帶著座標往下一頁走。
 *
 * 快捷鍵接的是**使用者自己已經有的東西**，不是寫死的示範地點：
 *   回公司    他設定過的通勤路線目的地（lib/commute）
 *   常用地點  他今天加進行程的目的地（lib/trips）
 * 沒有設定過就不顯示那顆 —— 一顆按下去說「你還沒設定」的按鈕沒有價值。
 * 機場接送是唯一的定值，因為它對誰都是同一個地方。
 */

const AIRPORT = '臺北松山機場'

export function BookingScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { location, status } = useLocationState()
  const { route } = useCommuteRoute()
  const trips = useTrips()

  /*
   * 從探索頁的任務面板帶進來的目的地（「精準導流」那條路）。
   * 有帶就直接填好，使用者不用再查一次。
   */
  const presetTo = params.get('to')?.trim()
  const presetToLat = Number(params.get('toLat'))
  const presetToLon = Number(params.get('toLon'))

  const [dropoff, setDropoff] = useState<RidePlace | null>(
    presetTo && Number.isFinite(presetToLat) && Number.isFinite(presetToLon)
      ? { label: presetTo, lat: presetToLat, lon: presetToLon }
      : null,
  )

  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searching) inputRef.current?.focus()
  }, [searching])

  /*
   * 上車點的名字。定位是 GPS 時我們只有座標沒有地名 ——
   * 與其顯示一串經緯度，不如說「目前位置」，那是使用者看得懂的說法。
   */
  const pickupLabel =
    location.label ?? (location.precise ? '目前位置' : `${FALLBACK_LABEL}（預設位置）`)

  const pickup: RidePlace = { label: pickupLabel, lat: location.lat, lon: location.lon }

  const search = async (term: string) => {
    const q = term.trim()
    if (!q) return

    setBusy(true)
    setError(null)
    try {
      const place = await lookupPlace(q)
      if (!place) {
        setError(`查不到「${q}」，換個說法試試`)
        return
      }
      setDropoff({ label: place.name, lat: place.lat, lon: place.lon })
      setSearching(false)
      setQuery('')
    } catch {
      setError('地點查詢暫時無法使用')
    } finally {
      setBusy(false)
    }
  }

  /* 快捷鍵：有對應的東西才顯示 */
  const shortcuts: Array<{ label: string; Icon: typeof PlaneIcon; onPick: () => void }> = [
    { label: '機場接送', Icon: PlaneIcon, onPick: () => void search(AIRPORT) },
  ]
  if (route?.destination) {
    const destination = route.destination
    shortcuts.push({ label: '回公司', Icon: HomeIcon, onPick: () => void search(destination) })
  }
  if (trips[0]) {
    const recent = trips[0].to
    shortcuts.push({ label: recent, Icon: StarIcon, onPick: () => void search(recent) })
  }

  const go = () => {
    if (!dropoff) {
      setSearching(true)
      return
    }
    const next = new URLSearchParams({
      from: pickup.label,
      fromLat: String(pickup.lat),
      fromLon: String(pickup.lon),
      to: dropoff.label,
      toLat: String(dropoff.lat),
      toLon: String(dropoff.lon),
    })
    navigate(`/ride/estimate?${next}`)
  }

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop
        /* 選好目的地就把視野帶過去，讓使用者確認自己查到的是哪裡 */
        center={dropoff ?? { lat: location.lat, lon: location.lon }}
        markers={
          dropoff
            ? [{ id: 'dropoff', position: { lng: dropoff.lon, lat: dropoff.lat }, label: dropoff.label }]
            : []
        }
      >
        <div className="absolute inset-x-4 top-3">
          {searching ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void search(query)
              }}
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 shadow-[0_3px_14px_rgba(22,32,55,.16)]"
            >
              <SearchIcon />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例如：臺北101、松山機場"
                className="h-8 w-full min-w-0 bg-transparent text-[16px] outline-none placeholder:text-subtle"
                aria-label="搜尋目的地"
              />
              <button
                type="button"
                onClick={() => {
                  setSearching(false)
                  setError(null)
                }}
                className="shrink-0 text-[14px] font-medium text-subtle"
              >
                取消
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="flex w-full items-center gap-3 rounded-full bg-surface px-4 py-3.5 text-left shadow-[0_3px_14px_rgba(22,32,55,.16)]"
            >
              <SearchIcon />
              <span className="min-w-0 flex-1 truncate text-[16px]">
                {dropoff ? (
                  <span className="font-semibold">{dropoff.label}</span>
                ) : (
                  <span className="text-subtle">你要去哪裡？</span>
                )}
              </span>
            </button>
          )}

          {(error || busy) && (
            <p
              className="mt-2 rounded-xl bg-surface px-3.5 py-2 text-[13px] shadow-[0_3px_14px_rgba(22,32,55,.12)]"
              role={error ? 'alert' : undefined}
            >
              {busy ? '查詢中…' : error}
            </p>
          )}
        </div>

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
        <div className="flex items-start gap-3">
          <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-subtle">目前上車位置</p>
            <p className="truncate text-[17px] font-bold">{pickupLabel}</p>
            {/*
              * 定位沒拿到時要講清楚這是預設位置。
              * 直接拿信義區的座標去估價，人在台中就會看到完全錯誤的車資。
              */}
            {!location.precise && (
              <button
                type="button"
                onClick={() => void requestLocation()}
                className="hit-area mt-0.5 text-[12px] font-medium text-primary"
              >
                {status === 'denied' ? '定位被拒絕，點此重試' : '尚未取得定位，點此開啟'}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="編輯上車位置"
            onClick={() => void requestLocation()}
            className="hit-area mt-1.5 shrink-0"
          >
            <PencilIcon />
          </button>
        </div>

        <div className="mt-3.5 flex gap-2">
          {shortcuts.map(({ label, Icon, onPick }) => (
            <button
              key={label}
              type="button"
              onClick={onPick}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-line/60 py-2.5 text-[13px] font-medium"
            >
              <Icon />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={go}
          className="mt-3.5 w-full rounded-xl bg-primary py-4 text-[18px] font-bold text-white transition-transform active:scale-[.98]"
        >
          {dropoff ? '呼叫 yoxi' : '選擇目的地'}
        </button>
      </BottomSheet>
    </div>
  )
}
