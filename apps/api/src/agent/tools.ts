import { tool } from 'ai'
import { z } from 'zod'

import { hasDatabase } from '../db/client.ts'
import { saveCommuteRoute } from '../db/repositories/commute.ts'
import {
  getBusStatus,
  getMetroStatus,
  hasTdxCredentials,
  isBusCity,
} from '../services/tdx.ts'
import { geocodeDistrict, getWeather } from '../services/weather.ts'

/*
 * Agent 可用的工具。
 *
 * save_commute_route 已接上真實資料庫，get_weather 已接上即時天氣，
 * get_transit_status 的捷運與公車都已接上 TDX；其餘仍回假資料，
 * 數值刻意對齊 Document/ 的設計稿，之後接真實來源時只要換掉 execute 的內容。
 *
 * 待辦：目前沒有身分驗證，使用者一律記為 DEV_USER_REF。
 * 接上登入後應改由請求帶入。
 */

const DEV_USER_REF = 'dev-user'

export const tools = {
  get_weather: tool({
    description: '查詢指定行政區目前的天氣、氣溫、紫外線指數與降雨。',
    inputSchema: z.object({
      district: z.string().describe('行政區，例如「信義區」「大安區」'),
    }),
    /*
     * 真實資料。查不到地點或外部服務掛掉時回傳 error 欄位，
     * 讓模型照實說「查不到」，而不是自己編一個溫度出來。
     */
    execute: async ({ district }) => {
      try {
        const place = await geocodeDistrict(district)
        if (!place) return { district, error: `查不到「${district}」這個地點` }

        const w = await getWeather(place.lat, place.lon)
        return {
          district: w.location ?? district,
          temperature_c: w.temperatureC,
          feels_like_c: w.feelsLikeC,
          humidity_percent: w.humidity,
          condition: w.condition,
          precipitation_mm: w.precipitationMm,
          uv_index: w.uvIndex,
          uv_level: w.uvLevel,
          advice: w.advice ? `${w.advice.title}，${w.advice.body}` : null,
          observed_at: w.observedAt,
        }
      } catch (error) {
        console.error('[get_weather]', error)
        return { district, error: '天氣服務暫時無法取得' }
      }
    },
  }),

  get_transit_status: tool({
    description:
      '查詢捷運或公車路線目前的營運狀況與事件通報。使用者問通勤、路線正不正常時使用。',
    inputSchema: z.object({
      line: z.string().describe('路線名稱，例如「板南線」「307」'),
      mode: z.enum(['metro', 'bus']).describe('運具類型'),
      stop: z
        .string()
        .optional()
        .describe('公車站牌名稱，例如「板橋放送所」。使用者問「我這站還有多久」時要帶。'),
      city: z
        .string()
        .optional()
        .describe('公車所屬縣市代碼，例如 Taipei、NewTaipei。預設 Taipei。'),
    }),
    /*
     * 捷運與公車都接上 TDX 了，但兩邊能拿到的東西差很多：
     *   捷運 只有營運事件，沒有誤點分鐘數，也沒有到站倒數
     *   公車 有真正的到站秒數，還有站牌層級的狀態
     * 所以回傳欄位刻意不一致 —— 硬湊成一樣只會讓模型講出沒有根據的數字。
     */
    execute: async ({ line, mode, stop, city }) => {
      if (!hasTdxCredentials()) {
        return { line, mode, error: 'TDX 金鑰未設定，查不到即時交通狀態' }
      }

      if (mode === 'bus') {
        const cityCode = city?.trim() || 'Taipei'
        if (!isBusCity(cityCode)) {
          return { line, mode, error: `不支援的縣市代碼「${cityCode}」` }
        }

        try {
          const bus = await getBusStatus(cityCode, line, stop)
          return {
            line: bus.route,
            mode,
            data_source: 'tdx',
            city: bus.city,
            stop_not_found: bus.stopNotFound,
            arrivals: bus.stops,
            incidents: bus.incidents,
            note: bus.note,
            observed_at: bus.observedAt,
          }
        } catch (error) {
          console.error('[get_transit_status:bus]', error)
          return { line, mode, error: '公車即時服務暫時無法取得' }
        }
      }

      try {
        const status = await getMetroStatus(line)
        if (!status) return { line, mode, error: `查不到「${line}」這條捷運路線` }

        return {
          line: status.line,
          mode,
          data_source: 'tdx',
          status: status.status,
          incidents: status.incidents,
          arriving_now: status.arrivingNow,
          note: status.note,
          observed_at: status.observedAt,
        }
      } catch (error) {
        console.error('[get_transit_status]', error)
        return { line, mode, error: '捷運即時服務暫時無法取得' }
      }
    },
  }),

  estimate_ride: tool({
    description: '估算兩地之間的計程車車程時間與車資區間。使用者想叫車或比較交通方式時使用。',
    inputSchema: z.object({
      from: z.string().describe('上車地點'),
      to: z.string().describe('下車地點'),
    }),
    execute: async ({ from, to }) => ({
      from,
      to,
      distance_km: 8.5,
      duration_minutes: 15,
      fare_twd: { min: 250, max: 320 },
      eta: '14:25',
    }),
  }),

  search_activities: tool({
    description:
      '依地點與興趣搜尋附近的活動或探索路線，會回傳路線名稱、距離、時間與補給站數量。',
    inputSchema: z.object({
      area: z.string().describe('地點，例如「大安森林公園」'),
      interest: z.string().optional().describe('興趣標籤，例如「Pokémon GO」「散步」'),
    }),
    execute: async ({ area, interest }) => ({
      area,
      interest: interest ?? null,
      routes: [
        {
          name: '大安綠意捕捉線',
          distance_km: 3.2,
          duration_minutes: 45,
          supply_stops: 18,
          tag: 'GO Fest 2026',
          popular: true,
        },
      ],
    }),
  }),

  save_commute_route: tool({
    description: '儲存使用者的常用通勤路線，之後路線有異常時可主動通知。',
    inputSchema: z.object({
      origin: z.string().describe('出發地，例如「板橋站」'),
      destination: z.string().describe('目的地，例如「市政府站」'),
      mode: z.enum(['metro', 'bus', 'mixed']).describe('主要運具'),
    }),
    execute: async ({ origin, destination, mode }) => {
      // 沒有設定 DATABASE_URL 時（例如純 demo 部署）回傳模擬結果，
      // 讓對話流程完整，只是資料不會真的留下。
      if (!hasDatabase()) {
        return {
          saved: true,
          persisted: false,
          origin,
          destination,
          mode,
          notification_enabled: true,
        }
      }

      const saved = await saveCommuteRoute({
        externalUserRef: DEV_USER_REF,
        origin,
        destination,
        mode,
      })
      return {
        saved: true,
        persisted: true,
        origin: saved.origin,
        destination: saved.destination,
        mode: saved.mode,
        notification_enabled: saved.notificationEnabled,
      }
    },
  }),
}
