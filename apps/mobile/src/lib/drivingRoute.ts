import { useEffect, useState } from 'react'

import type { Coordinate } from './map'

/*
 * 叫車流程地圖上那條路線的幾何。
 *
 * 專案裡沒有道路網的路徑規劃 —— 後端只有捷運路網（routePlan），
 * 估價用的是直線距離乘繞路係數（apps/api 的 services/ride.ts）。
 * 所以路線形狀直接向公開的 OSRM demo 伺服器要：免金鑰、回傳 GeoJSON 折線。
 *
 * ── 這條線只是「畫圖用」──
 *
 * 它不參與估價，車程與車資照樣是後端依公告費率算的。
 * 所以 OSRM 拿不到（逾時、限流、離線）時退回兩點直線就好，
 * 畫面上少的只是路線的彎曲，不會有任何數字因此變錯。
 * 直線用虛線畫（見 Map 的路線圖層），一眼看得出那不是實際道路。
 *
 * 公開 demo 伺服器沒有 SLA，正式上線前要換成自架或商業服務 ——
 * 只要改 OSRM_BASE 與 parse 的部分，呼叫端拿到的形狀不用動。
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

/*
 * 三秒就放棄。路線只是裝飾，等更久的話使用者會先看到一張沒有線的地圖
 * 好幾秒，那比直接給直線更像壞掉。
 */
const TIMEOUT_MS = 3_000

export type DrivingRoute = {
  coordinates: Coordinate[]
  /** road = 實際道路折線；straight = 拿不到時的兩點直線 */
  source: 'road' | 'straight'
}

/* 座標取到小數第五位（約 1 公尺）當快取鍵 —— 同一趟車在四頁之間座標完全一樣 */
function keyOf(from: Coordinate, to: Coordinate): string {
  return `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
}

/*
 * 只快取「拿到道路」的結果。
 *
 * 失敗退回的直線不進快取：OSRM 偶爾限流，失敗一次就整個 session 都畫直線不划算，
 * 下次進這一頁（或換一組座標再換回來）會再試一次。
 * 進行中的請求另外記著，四頁同時要同一段時不會重複打。
 */
const resolved = new Map<string, DrivingRoute>()
const inflight = new Map<string, Promise<DrivingRoute>>()

function straight(from: Coordinate, to: Coordinate): DrivingRoute {
  return { coordinates: [from, to], source: 'straight' }
}

async function requestRoad(from: Coordinate, to: Coordinate): Promise<Coordinate[] | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const body = (await res.json()) as {
      code?: string
      routes?: Array<{ geometry?: { coordinates?: unknown } }>
    }
    const raw = body.code === 'Ok' ? body.routes?.[0]?.geometry?.coordinates : null
    if (!Array.isArray(raw) || raw.length < 2) return null

    const points: Coordinate[] = []
    for (const p of raw) {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        points.push({ lng: Number(p[0]), lat: Number(p[1]) })
      }
    }
    return points.length >= 2 ? points : null
  } catch {
    /* 逾時（AbortError）、斷網、CORS、JSON 壞掉，一律當作拿不到 */
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 拿一段開車路線。永遠不會 reject —— 拿不到就是直線。 */
export function fetchDrivingRoute(from: Coordinate, to: Coordinate): Promise<DrivingRoute> {
  const key = keyOf(from, to)
  const hit = resolved.get(key)
  if (hit) return Promise.resolve(hit)

  const pending = inflight.get(key)
  if (pending) return pending

  const job = requestRoad(from, to).then((road) => {
    inflight.delete(key)
    if (!road) return straight(from, to)
    const route: DrivingRoute = { coordinates: road, source: 'road' }
    resolved.set(key, route)
    return route
  })
  inflight.set(key, job)
  return job
}

/**
 * 兩點之間的開車路線。
 *
 * 回 null 代表還在拿（最多 TIMEOUT_MS）；之後一定會有值，最差是直線。
 * 兩端任一缺席就一直是 null —— 例如估價頁的目的地還在查。
 */
export function useDrivingRoute(from: Coordinate | null, to: Coordinate | null): DrivingRoute | null {
  const key = from && to ? keyOf(from, to) : null
  const [result, setResult] = useState<{ key: string; route: DrivingRoute } | null>(null)

  /*
   * 相依只放 key：from/to 每次 render 都是新物件（從 lat/lon 現組的），
   * 放進去會每秒重打一次（行程頁有每秒更新的倒數）。key 已經涵蓋了座標。
   */
  const fromLng = from?.lng
  const fromLat = from?.lat
  const toLng = to?.lng
  const toLat = to?.lat

  useEffect(() => {
    if (!key || fromLng === undefined || fromLat === undefined || toLng === undefined || toLat === undefined) return
    if (resolved.has(key)) return

    let alive = true
    void fetchDrivingRoute({ lng: fromLng, lat: fromLat }, { lng: toLng, lat: toLat }).then((route) => {
      if (alive) setResult({ key, route })
    })
    return () => {
      alive = false
    }
  }, [key, fromLng, fromLat, toLng, toLat])

  if (!key) return null
  /* 快取命中就同步給，換頁時路線不會先消失再出現 */
  const hit = resolved.get(key)
  if (hit) return hit
  return result?.key === key ? result.route : null
}

/*
 * ── 幾何小工具 ──
 */

/** 近似的平面距離（公尺）。只用來在一條市區路線上按比例取點，不需要大圓公式的精度。 */
function approxMeters(a: Coordinate, b: Coordinate): number {
  const dLat = (b.lat - a.lat) * 111_320
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLng)
}

/**
 * 沿著折線走到 fraction（0–1）的位置。
 *
 * 行程頁用它把「目前位置」放在路線上 —— 進度是模擬的（lib/ride 的 DEMO_SPEEDUP），
 * 但點至少要落在車真的會走的那條路上，不是飄在兩點連線的半空中。
 */
export function pointAlong(line: Coordinate[], fraction: number): Coordinate | null {
  if (line.length === 0) return null
  if (line.length === 1 || fraction <= 0) return line[0]
  if (fraction >= 1) return line[line.length - 1]

  const segments: number[] = []
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const d = approxMeters(line[i - 1], line[i])
    segments.push(d)
    total += d
  }
  if (total === 0) return line[0]

  let remaining = total * fraction
  for (let i = 0; i < segments.length; i++) {
    const d = segments[i]
    if (remaining <= d) {
      const t = d === 0 ? 0 : remaining / d
      const a = line[i]
      const b = line[i + 1]
      return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }
    }
    remaining -= d
  }
  return line[line.length - 1]
}

/** 一組點的外框 [西, 南, 東, 北]，給地圖 fit 用。沒有點時回 null。 */
export function boundsOf(points: Coordinate[]): [number, number, number, number] | null {
  if (points.length === 0) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const p of points) {
    w = Math.min(w, p.lng)
    e = Math.max(e, p.lng)
    s = Math.min(s, p.lat)
    n = Math.max(n, p.lat)
  }
  return [w, s, e, n]
}
