import { useMemo } from 'react'

import { boundsOf, useDrivingRoute, type DrivingRoute } from './drivingRoute'
import type { Coordinate } from './map'

/*
 * 叫車流程四頁地圖上要畫的東西：路線、要看到的範圍、模擬的車輛位置。
 *
 * 四頁共用這一份，頁面只決定「哪兩點之間」與「放哪些標記」——
 * 不要每頁各自組一次 fit 範圍或各自算車的位置，改一處就會四頁不一致。
 */

export type RideMapRoute = {
  /** 已經拿到的路線（道路或直線退路）；還在拿時是 null */
  driving: DrivingRoute | null
  /** 直接交給 MapBackdrop 的 route */
  route: { coordinates: Coordinate[]; dashed: boolean } | null
  /** 直接交給 MapBackdrop 的 fitBounds */
  fitBounds: [number, number, number, number] | null
}

/**
 * 兩點之間的路線，以及讓整段路都落在畫面裡的範圍。
 *
 * 路線還沒回來時就先用兩個端點 fit —— 至少兩點都看得到；
 * 道路折線回來之後改用整條線的外框（道路可能繞出兩點連成的矩形之外）。
 */
export function useRideMapRoute(
  from: Coordinate | null,
  to: Coordinate | null,
  {
    /*
     * 要不要把線接回真正的起點。
     *
     * OSRM 會把兩端吸到最近的道路上，回來的折線兩頭跟標記之間會差一小段
     * （臺北101 實測差了二十幾公尺，畫面上就是線停在半路、沒碰到終點的圓）。
     * 所以畫的時候把兩端的原始座標接上去。
     *
     * 司機頁要關掉起點那一頭：司機的出發點是模擬的、可能落在建物裡，
     * 車就是放在吸附後的道路起點上，線要從車開始。
     */
    joinStart = true,
  }: { joinStart?: boolean } = {},
): RideMapRoute {
  const driving = useDrivingRoute(from, to)
  const ends = [from, to].filter((p): p is Coordinate => p !== null)

  /*
   * 要 memo：地圖拿線的陣列身分判斷要不要重畫圖層，
   * 行程頁每秒 render 一次（倒數），不 memo 的話路線圖層每秒拆掉重建一次。
   */
  const route = useMemo(() => {
    if (!driving) return null
    const coordinates =
      driving.source === 'road'
        ? [...(joinStart && from ? [from] : []), ...driving.coordinates, ...(to ? [to] : [])]
        : driving.coordinates
    return { coordinates, dashed: driving.source === 'straight' }
  }, [driving, from, to, joinStart])

  return {
    driving,
    route,
    fitBounds: boundsOf(route ? route.coordinates : ends),
  }
}

/*
 * ── 模擬的車輛位置 ──
 *
 * 沒有接 yoxi 的車輛定位，這些位置是**示意**：畫面上必須標示出來
 * （叫車首頁地圖上那行「附近車輛為示意」，司機頁的「模擬派車」）。
 *
 * 用固定的偏移而不是亂數：亂數的話每次 render 車都會跳位置，
 * 而且 demo 前一晚看到的跟隔天現場看到的不一樣。
 */

/*
 * 上車點周圍三台。緯度 0.001 度約 111 公尺、經度在臺灣約 101 公尺，
 * 所以三台分別在西北 360 公尺、東北 310 公尺、東南 210 公尺左右 ——
 * 390px 寬的手機在縮放 15 時左右各只看得到約 400 公尺，再遠就出畫面了。
 */
const NEARBY_OFFSETS = [
  { dLat: 0.0026, dLng: -0.0024 },
  { dLat: 0.0011, dLng: 0.0028 },
  { dLat: -0.0017, dLng: 0.0012 },
]

export function nearbyCars(pickup: Coordinate): Array<{ id: string; position: Coordinate }> {
  return NEARBY_OFFSETS.map((o, i) => ({
    id: `nearby-car-${i}`,
    position: { lng: pickup.lng + o.dLng, lat: pickup.lat + o.dLat },
  }))
}

/*
 * 司機出發的位置：上車點東北方約 750 公尺。
 * 那個點可能落在建物或河裡，沒關係 —— OSRM 會把起點吸到最近的道路上，
 * 司機頁的車輛標記放在路線的第一個點，而不是這裡。
 */
export function driverStartOf(pickup: Coordinate): Coordinate {
  return { lng: pickup.lng + 0.0045, lat: pickup.lat + 0.0055 }
}
