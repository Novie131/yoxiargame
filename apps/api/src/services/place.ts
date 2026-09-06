import {
  findMetroStation,
  findNearestStation,
  findStationPosition,
  hasTdxCredentials,
} from './tdx.ts'
import { estimateWalkMinutes, MAX_WALK_TO_STATION_METERS } from './trip-options.ts'
import { describePlace, geocodePlace } from './weather.ts'

/*
 * 把「使用者講的地方」變成「可以拿去規劃的東西」。
 *
 * 存在的理由：使用者不會講捷運站名。他會說「幫我安排到北車」「我現在這裡」
 * 「台北 101」。路徑規劃只認得站名，天氣只認得座標，中間這一段轉換
 * 以前是缺的 —— 所以「當前位置」對 agent 一直是一個查不到的地名。
 *
 * 解析順序刻意是「先站名、再地標」：
 *   「市政府」是捷運站，也是市政府大樓。先查站表才不會為了一個
 *   本來就在捷運站上的地方多打一次地理編碼、還可能被解析到別的縣市。
 */

export type ResolvedStation = {
  name: string
  /** 從這個地點走到車站要幾分鐘。地點本身就是車站時為 0。 */
  walkMinutes: number
  walkMeters: number
}

export type ResolvedPlace = {
  /** 使用者認得的名字。「目前位置」也算。 */
  label: string
  lat: number
  lon: number
  /** 最近的捷運站。大台北以外、或站表拿不到時為 null。 */
  station: ResolvedStation | null
  /*
   * 走得到捷運站。false 時捷運不是這一趟的合理選項，
   * 呼叫端要照實講（「從最近的站還要走 40 分鐘」），不要假裝可以搭。
   */
  metroReachable: boolean
  source: 'station' | 'geocode' | 'coordinates'
}

/** 使用者當前位置。前端在對話請求裡帶進來，見 app.ts 的 /agent/chat。 */
export type UserLocation = {
  lat: number
  lon: number
  /** false 代表是手動選的或退路座標，不是 GPS 定位 */
  precise: boolean
  /** 前端已經知道地名時帶上，省一次反向地理編碼 */
  label?: string | null
}

async function nearestStationOf(lat: number, lon: number): Promise<ResolvedStation | null> {
  if (!hasTdxCredentials()) return null

  const nearest = await findNearestStation(lat, lon)
  if (!nearest) return null

  return {
    name: nearest.name,
    walkMinutes: estimateWalkMinutes(nearest.distanceMeters),
    walkMeters: Math.round(nearest.distanceMeters),
  }
}

const reachable = (station: ResolvedStation | null) =>
  station !== null && station.walkMeters <= MAX_WALK_TO_STATION_METERS

/**
 * 地名 → 座標 + 最近車站。查不到這個地方時回 null。
 */
export async function resolvePlaceName(name: string): Promise<ResolvedPlace | null> {
  const query = name.trim()
  if (!query) return null

  /* 先當成捷運站名試一次 */
  if (hasTdxCredentials()) {
    const station = await findMetroStation(query)
    if (station) {
      const position = await findStationPosition(station.name)
      if (position) {
        return {
          label: station.name,
          lat: position.lat,
          lon: position.lon,
          station: { name: station.name, walkMinutes: 0, walkMeters: 0 },
          metroReachable: true,
          source: 'station',
        }
      }
      /* 站表有這一站卻沒有座標（資料不全）—— 往下走地理編碼那條路 */
    }
  }

  const place = await geocodePlace(query)
  if (!place) return null

  const station = await nearestStationOf(place.lat, place.lon).catch(() => null)
  return {
    label: place.shortName,
    lat: place.lat,
    lon: place.lon,
    station,
    metroReachable: reachable(station),
    source: 'geocode',
  }
}

/**
 * 座標 → 地名 + 最近車站。用在使用者的當前位置。
 *
 * 地名查不到不影響其他欄位 —— 反向地理編碼是加分項，
 * 掛掉時退回「目前位置」這個標籤就好，不要讓整趟規劃失敗。
 */
export async function resolveUserLocation(location: UserLocation): Promise<ResolvedPlace> {
  const [label, station] = await Promise.all([
    location.label?.trim()
      ? Promise.resolve(location.label.trim())
      : describePlace(location.lat, location.lon).catch(() => null),
    nearestStationOf(location.lat, location.lon).catch(() => null),
  ])

  return {
    label: label || '目前位置',
    lat: location.lat,
    lon: location.lon,
    station,
    metroReachable: reachable(station),
    source: 'coordinates',
  }
}
