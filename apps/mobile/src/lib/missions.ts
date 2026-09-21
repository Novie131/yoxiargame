import { useEffect, useState } from 'react'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 附近的探索任務，資料來自後端的 /missions/nearby。
 *
 * 後端用 PostGIS 的 ST_DWithin 查 missions 表（001 就建好了，含空間索引，
 * 但一直沒有任何程式碼用它）。這是探索地圖上標記的唯一來源 ——
 * 沒有資料就是沒有標記，不放示範用的假圖釘。
 */

export type Mission = {
  id: string
  name: string
  campaign: string
  lat: number
  lon: number
  radiusMeters: number
  /** 興趣標籤，值與 lib/interests 的 id 一致 */
  tags: string[]
  distanceMeters: number
  /** 使用者已經在這個任務的圍欄範圍內 */
  inside: boolean
  /*
   * 這個人在這個任務上的進度。還沒碰過就是 null。
   * 跟任務本身在同一個請求裡回來 —— 分兩次拿的話，地圖會先畫出一批
   * 「未完成」的圖釘再變色，那個閃爍看起來像壞掉。
   */
  status: 'seen' | 'started' | 'completed' | null
  completedAt: string | null
}

function isMission(value: unknown): value is Mission {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.lat === 'number' &&
    typeof m.lon === 'number' &&
    /* 沒有標籤的任務會讓篩選判斷炸掉，寧可當成不合法直接丟掉 */
    Array.isArray(m.tags)
  )
}

/** 打卡的結果。ok 為 false 時 reason 說明為什麼，畫面要據此講不同的話。 */
export type CheckInResult =
  | {
      ok: true
      name: string
      /** 這次之前就完成過了 —— 重送不該再慶祝一次，但也不是錯誤 */
      alreadyCompleted: boolean
      completedAt: string
    }
  | {
      ok: false
      /** not-found = 任務不存在；closed = 活動結束；outside = 不在範圍內 */
      reason: 'not-found' | 'closed' | 'outside'
      name?: string
      /** outside 時的實際距離，這是使用者唯一能行動的資訊 */
      distanceMeters?: number
    }

/**
 * 打卡完成一個任務。
 *
 * 判定在伺服器做（用任務自己的圍欄半徑），前端這邊的 inside 只用來決定
 * 按鈕亮不亮 —— 兩邊會不一致，例如使用者站在邊界上、或定位飄了幾公尺。
 * 那時候以伺服器為準，把它的理由照實顯示出來。
 */
export async function checkInMission(
  missionId: string,
  origin: { lat: number; lon: number },
): Promise<CheckInResult> {
  const res = await fetch(`${API_URL}/missions/${missionId}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ lat: origin.lat, lon: origin.lon }),
  })

  const body = (await res.json().catch(() => null)) as CheckInResult | null
  if (body && typeof body === 'object' && 'ok' in body) return body

  /* 連格式都不對（502、代理商的錯誤頁）—— 當成不在範圍內會誤導，照實說不知道 */
  throw new Error(`伺服器回應 ${res.status}`)
}

/*
 * 兩點間的直線距離（公尺）。Haversine。
 */
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

/**
 * 任務相對於**使用者**的距離與圍欄判定。
 *
 * 為什麼不能直接用 API 回的 distanceMeters / inside：那兩個值是相對於
 * 查詢座標算的，而查詢座標是**地圖中心**，不是使用者。從通知點進來時
 * 地圖會被移到任務位置，距離就變成 0、inside 變成 true ——
 * 面板於是對一個人在別處的使用者說「你已經在範圍內」（實際發生過）。
 *
 * 沒有精確定位時回 null，呼叫端要照實說不知道，不要拿地圖中心頂替。
 */
export function missionRelativeTo(
  mission: Mission,
  origin: { lat: number; lon: number } | null,
): { distanceMeters: number; inside: boolean } | null {
  if (!origin) return null
  const distanceMeters = Math.round(
    haversineMeters(origin.lat, origin.lon, mission.lat, mission.lon),
  )
  return { distanceMeters, inside: distanceMeters <= mission.radiusMeters }
}

export function useNearbyMissions(
  lat: number,
  lon: number,
  radiusMeters: number,
): Mission[] {
  const [missions, setMissions] = useState<Mission[]>([])

  /* 座標取到小數第三位（約 100 公尺）當相依，免得手指一動就重打 */
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${radiusMeters}`

  useEffect(() => {
    let alive = true
    const [la, lo, r] = key.split(',')

    /* 帶上使用者識別才拿得到 status（哪些已經完成） */
    fetch(`${API_URL}/missions/nearby?lat=${la}&lon=${lo}&radius=${r}`, {
      headers: userHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as { missions?: unknown }
      })
      .then((body) => {
        if (!alive) return
        setMissions(Array.isArray(body.missions) ? body.missions.filter(isMission) : [])
      })
      .catch(() => {
        /* 任務是輔助內容，拿不到就不顯示標記，不要擋住地圖 */
        if (alive) setMissions([])
      })

    return () => {
      alive = false
    }
  }, [key])

  return missions
}
