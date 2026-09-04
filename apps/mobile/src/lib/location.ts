import { useEffect, useState } from 'react'

/*
 * 使用者位置。
 *
 * 天氣列與探索地圖都要用，所以抽成同一份 —— 兩邊各自呼叫 geolocation 的話，
 * 權限提示會跳兩次，退路座標也可能不一致。
 *
 * 拿不到位置（沒授權、逾時、瀏覽器不支援）就退到台北市信義區，並且把
 * precise 標成 false。這個旗標很重要：畫面可以用退路座標決定要看哪裡，
 * 但**不能**在那個座標上畫一個「你在這裡」的點 —— 那是在騙人。
 */

export type UserLocation = {
  lat: number
  lon: number
  /** false 代表這是退路座標，不是使用者真正的所在地 */
  precise: boolean
}

/* 台北市信義區（市政府一帶）。定位拿不到時的預設位置。 */
export const FALLBACK_LOCATION: UserLocation = {
  lat: 25.0375,
  lon: 121.5637,
  precise: false,
}

export const FALLBACK_LABEL = '台北市信義區'

/* 跟天氣的快取時間一致，切分頁回來不用重新要一次權限 */
const TTL_MS = 10 * 60 * 1000
const TIMEOUT_MS = 8000

let snapshot: { at: number; value: UserLocation } | null = null
let inflight: Promise<UserLocation> | null = null

/** 取得位置。多個畫面同時要時共用同一次請求與十分鐘內的結果。 */
export function locate(): Promise<UserLocation> {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) {
    return Promise.resolve(snapshot.value)
  }
  if (inflight) return inflight

  inflight = new Promise<UserLocation>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(FALLBACK_LOCATION)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precise: true }),
      /* 被拒絕、逾時、定位失敗，一律走退路，不要讓畫面卡在載入中 */
      () => resolve(FALLBACK_LOCATION),
      { timeout: TIMEOUT_MS, maximumAge: TTL_MS },
    )
  })
    .then((value) => {
      snapshot = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/**
 * 位置的 hook。
 *
 * 初值直接給退路座標而不是 null，這樣畫面第一幀就有東西可畫，
 * 不用為「還在定位中」做一套額外的載入狀態。定位回來再換掉。
 */
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>(
    () => snapshot?.value ?? FALLBACK_LOCATION,
  )

  useEffect(() => {
    let alive = true
    void locate().then((value) => {
      if (alive) setLocation(value)
    })
    return () => {
      alive = false
    }
  }, [])

  return location
}
