import { useEffect, useRef, useState } from 'react'

import { reportGpsFix } from './location'
import type { Mission } from './missions'

/*
 * 前景地理圍欄。
 *
 * ROADMAP 一直把「動態地理圍欄」記成沒有做 —— 因為在這之前，任務只有
 * **拉**的那一半：使用者自己打開 App、自己查附近。真正的地理圍欄是**推**：
 * 走進去就觸發，不用他先想到要看。
 *
 * 這個檔案補上「推」的前景版本：App 開著的時候持續定位，跨進某個任務的
 * 半徑就發一次通知。
 *
 * ── 誠實範圍：這是前景，不是背景 ──
 * App 切到背景或螢幕關掉之後，瀏覽器與 WebView 都會停掉 watchPosition，
 * 這裡就不再觸發。真正的背景圍欄需要作業系統層級的 region monitoring
 * （iOS 的 CLCircularRegion、Android 的 Geofencing API），那要裝原生外掛、
 * 改 native 專案設定、並且搭配推播才送得出去 —— 見 ROADMAP 的 B8。
 *
 * PWA **永遠做不到**背景圍欄：Service Worker 沒有定位能力，
 * 這不是還沒做，是規格上就沒有。
 *
 * 所以畫面上不要承諾「我們會在你走到時通知你」——
 * 只能承諾「App 開著的時候會」。
 */

/*
 * 離開圍欄要比進入多走這麼多公尺才算數（公尺）。
 *
 * 沒有這個緩衝的話，人站在邊界上、GPS 飄個幾公尺，就會反覆觸發「進入／離開」，
 * 通知會像壞掉一樣一直跳。這是遲滯（hysteresis），不是誤差補償 ——
 * 進入的判定仍然用任務原本的半徑，只有「離開」放寬。
 */
const EXIT_BUFFER_METERS = 40

/*
 * 定位精度比這個還差就不拿來判定圍欄（公尺）。
 *
 * 室內或收訊差的時候，瀏覽器會回傳精度好幾百公尺的座標。拿那種座標去比
 * 兩百公尺的圍欄，等於擲骰子 —— 而誤報一次「你到了」會讓使用者白跑。
 * 寧可不觸發，他還是可以自己打開任務面板。
 */
const MAX_ACCURACY_METERS = 100

/** 兩點間的直線距離（公尺）。Haversine。 */
function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 剛剛走進來的那個任務。畫面用它跳提示。 */
export type GeofenceEntry = {
  mission: Mission
  /** 觸發當下與任務中心的距離（公尺） */
  distanceMeters: number
  at: number
}

/**
 * 監看一組任務的圍欄，跨進去時回傳那一筆。
 *
 * 回傳 null 代表現在沒有「剛進入」的事件 —— 呼叫端關掉提示後要能回到這個狀態，
 * 所以另外給一個 dismiss。
 */
export function useGeofenceWatch(missions: Mission[]): {
  entered: GeofenceEntry | null
  dismiss: () => void
  /** 瀏覽器不支援或權限被拒時為 false，畫面據此不要承諾會通知 */
  watching: boolean
} {
  const [entered, setEntered] = useState<GeofenceEntry | null>(null)
  const [watching, setWatching] = useState(false)

  /*
   * 目前人在哪些圍欄裡。
   *
   * 用 ref 而不是 state：它每次定位更新都會變，但它本身不該觸發重繪 ——
   * 需要重繪的只有「剛跨進去」那一刻。放進 state 會讓整頁跟著 GPS 跳動重畫。
   */
  const inside = useRef<Set<string>>(new Set())

  /*
   * 這次工作階段已經提示過的任務。
   *
   * 沒有這個的話，使用者在圍欄邊緣來回走（或關掉提示後沒離開），
   * 同一個任務會一直跳 —— 那會讓人直接關掉定位權限。
   */
  const announced = useRef<Set<string>>(new Set())

  /*
   * 讓 effect 讀得到最新的任務清單，又不用把 missions 放進相依。
   * 放進相依的話，每次查詢回來（陣列是新的）都會重新建立一次 watchPosition，
   * 而每次重建都會重新要一次定位、重設遲滯狀態。
   *
   * 指派放在 effect 裡而不是 render 期間：render 期間改 ref 在
   * concurrent rendering 下不保證只發生一次（React 可能丟棄一次 render）。
   */
  const latest = useRef(missions)
  useEffect(() => {
    latest.current = missions
  }, [missions])

  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setWatching(true)

        const { latitude, longitude, accuracy } = position.coords
        /* 位置本身仍然有用（地圖、天氣），先回報再決定要不要拿來判圍欄 */
        reportGpsFix(latitude, longitude)

        /* 精度太差就不判定，理由見 MAX_ACCURACY_METERS */
        if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_METERS) return

        for (const mission of latest.current) {
          /* 已經完成的不再提示 —— 他已經做過了 */
          if (mission.status === 'completed') continue

          const distance = haversineMeters(latitude, longitude, mission.lat, mission.lon)
          const wasInside = inside.current.has(mission.id)

          /* 進入用原本的半徑，離開要多走 EXIT_BUFFER_METERS 才算 */
          const threshold = wasInside
            ? mission.radiusMeters + EXIT_BUFFER_METERS
            : mission.radiusMeters
          const nowInside = distance <= threshold

          if (nowInside && !wasInside) {
            inside.current.add(mission.id)
            /* 只在第一次跨進來時提示 */
            if (!announced.current.has(mission.id)) {
              announced.current.add(mission.id)
              setEntered({ mission, distanceMeters: Math.round(distance), at: Date.now() })
            }
          } else if (!nowInside && wasInside) {
            inside.current.delete(mission.id)
          }
        }
      },
      () => {
        /* 被拒絕或拿不到 —— 圍欄就是不會觸發，畫面不要承諾會通知 */
        setWatching(false)
      },
      {
        /* 圍欄判定需要真實精度，網路定位的幾百公尺誤差沒有意義 */
        enableHighAccuracy: true,
        /* 快取超過這個時間的座標就重新定位。太長會讓「走進去」延遲好幾分鐘。 */
        maximumAge: 10_000,
        timeout: 20_000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(id)
    }
  }, [])

  return { entered, dismiss: () => setEntered(null), watching }
}
