import { tool } from 'ai'
import { z } from 'zod'

import { hasDatabase } from '../db/client.ts'
import { findNearbyMissions } from '../db/repositories/missions.ts'
import { readRoute, saveRoute } from '../services/commute.ts'
import { planMetroRoute } from '../services/route-planner.ts'
import { getBusStatus, getMetroStatus, hasTdxCredentials, isBusCity } from '../services/tdx.ts'
import { geocodeDistrict, getWeather } from '../services/weather.ts'

/*
 * Agent 可用的工具。
 *
 * 通勤路線、天氣、捷運與公車即時狀態都已接上真實來源；
 * estimate_ride 與 search_activities 仍回假資料，數值刻意對齊 Document/ 的設計稿，
 * 之後接真實來源時只要換掉 execute 的內容。
 *
 * 工具分兩類：
 *   sharedTools  跟使用者無關，模組層定義一次即可
 *   createTools  綁定單一使用者的工具（讀寫通勤路線），每次請求建立
 *
 * 之所以要分開：通勤路線必須寫在發話者身上。在有 createTools 之前，
 * 所有人都被記成同一個 'dev-user'，等於共用一條路線。
 */

const sharedTools = {
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

  plan_route: tool({
    description:
      '規劃兩個捷運站之間的最佳路線，回傳預估時間、轉乘次數與每一段搭哪條線。' +
      '使用者問「怎麼去」「要多久」「要轉幾次車」時使用。',
    inputSchema: z.object({
      from: z.string().describe('出發站，例如「板橋」'),
      to: z.string().describe('目的站，例如「市政府」'),
    }),
    /*
     * 時間的組成要講清楚，模型才不會把它說成保證值：
     * 行駛與停靠是 TDX 的實際數據，轉乘步行也是，只有轉乘等車是估計，
     * 而且完全沒有算「等第一班車」。
     */
    execute: async ({ from, to }) => {
      if (!hasTdxCredentials()) {
        return { from, to, error: 'TDX 金鑰未設定，無法規劃路線' }
      }

      try {
        const plan = await planMetroRoute(from, to)
        if (!plan) {
          return { from, to, error: `查不到「${from}」到「${to}」的捷運路線` }
        }

        return {
          from: plan.from,
          to: plan.to,
          data_source: 'tdx',
          total_minutes: plan.totalMinutes,
          transfers: plan.transfers,
          legs: plan.legs,
          note: '時間為估計值，不含等第一班車的時間',
        }
      } catch (error) {
        console.error('[plan_route]', error)
        return { from, to, error: '路線規劃暫時無法使用' }
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
      '搜尋某個地點附近正在進行的探索任務，會回傳任務名稱、所屬活動與距離。' +
      '使用者問「附近有什麼好玩的」「這附近有什麼活動」時使用。',
    inputSchema: z.object({
      area: z.string().describe('地點，例如「大安森林公園」「信義區」'),
      interests: z
        .array(
          z.enum([
            'food', 'travel', 'sport', 'music', 'photo',
            'reading', 'movie', 'tech', 'bar', 'coffee',
          ]),
        )
        .optional()
        .describe(
          '興趣標籤，用來過濾任務。使用者有講偏好才帶（「想喝咖啡」→ coffee）。' +
            '沒講就不要帶，會回傳全部。',
        ),
    }),
    /*
     * 真實資料：地點先地理編碼，再用 PostGIS 的 ST_DWithin 查 missions，
     * 有帶 interests 就再做標籤交集（吃 GIN 索引）。
     *
     * 注意標籤裡**沒有**任何 Pokémon GO / Pikmin 的資料 —— 我們跟那兩款遊戲
     * 沒有實際整合，所以沒有任何任務掛那些標籤，也不該讓模型假裝有。
     */
    execute: async ({ area, interests }) => {
      if (!hasDatabase()) return { area, error: '任務資料庫未設定' }

      try {
        const place = await geocodeDistrict(area)
        if (!place) return { area, error: `查不到「${area}」這個地點` }

        const missions = await findNearbyMissions(place.lat, place.lon, 3000, 10, interests)
        /*
         * 地理編碼回的是完整地址（「大安森林公園, 溫州街, 龍坡里, 大安區, …」），
         * 整串塞進卡片標題會很醜。取第一段就是使用者認得的地名。
         */
        const areaName = place.displayName?.split(',')[0]?.trim() || area
        return {
          area: areaName,
          data_source: 'missions',
          filtered_by: interests ?? null,
          count: missions.length,
          missions: missions.map((m) => ({
            /* 前端的卡片用它做 deep link，直接打開那個任務的面板 */
            id: m.id,
            name: m.name,
            campaign: m.campaign,
            /*
             * 距離是相對於「查詢的那個地區」，不是相對於使用者本人 ——
             * 我們不知道使用者現在在哪。所以這裡刻意沒有 in_range，
             * 免得模型講出「你已經在範圍內」這種它無從得知的話。
             */
            distance_from_area_meters: m.distanceMeters,
            tags: m.tags,
            /* 座標是給前端的任務卡用的：沒有它就按不了「叫車前往」 */
            lat: m.lat,
            lon: m.lon,
          })),
        }
      } catch (error) {
        console.error('[search_activities]', error)
        return { area, error: '任務搜尋暫時無法使用' }
      }
    },
  }),
}

/**
 * 綁定單一使用者的工具集。每次請求呼叫一次，userRef 來自 identity.readUserRef。
 */
export function createTools(userRef: string) {
  return {
    ...sharedTools,

    save_commute_route: tool({
      description:
        '儲存使用者的常用通勤路線，之後路線有異常時可主動通知。' +
        '使用者描述自己每天怎麼上班（例如「我從板橋搭捷運到市政府」）時就呼叫。',
      inputSchema: z.object({
        origin: z.string().describe('出發地，例如「板橋站」'),
        destination: z.string().describe('目的地，例如「市政府站」'),
        mode: z.enum(['metro', 'bus', 'mixed']).describe('主要運具'),
        line: z
          .string()
          .optional()
          .describe(
            '路線名。使用者有明講才帶（捷運「板南線」、公車「307」）；' +
              '沒明講就不要帶，系統會自己從起訖站推出來。',
          ),
        city: z
          .string()
          .optional()
          .describe(
            '公車所屬縣市代碼（Taipei、NewTaipei、Taichung…）。' +
              '運具是公車或混合時要帶，捷運不用。使用者沒講就不要帶。',
          ),
        usual_days: z
          .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
          .optional()
          .describe('通勤的星期。「平日」= mon…fri。每天都通勤就不要帶。'),
        usual_time_start: z
          .string()
          .optional()
          .describe('通知時段的開始，HH:MM 24 小時制，例如 07:00。要跟結束成對出現。'),
        usual_time_end: z
          .string()
          .optional()
          .describe('通知時段的結束，HH:MM 24 小時制，例如 21:00。要跟開始成對出現。'),
      }),
      execute: async ({
        origin,
        destination,
        mode,
        line,
        city,
        usual_days,
        usual_time_start,
        usual_time_end,
      }) => {
        try {
          const { route, transferRequired, persisted } = await saveRoute({
            userRef,
            origin,
            destination,
            mode,
            line,
            city,
            usualDays: usual_days,
            /* 只給一邊沒有意義，兩邊都有才算指定了時段 */
            usualTimeStart: usual_time_start && usual_time_end ? usual_time_start : null,
            usualTimeEnd: usual_time_start && usual_time_end ? usual_time_end : null,
          })
          return {
            saved: true,
            persisted,
            /* 這個 route 會被 agent/index.ts 轉成串流事件，讓前端即時更新畫面 */
            route: {
              origin: route.origin,
              destination: route.destination,
              mode: route.mode,
              line: route.line,
              city: route.city,
              usual_days: route.usualDays,
              usual_time_start: route.usualTimeStart,
              usual_time_end: route.usualTimeEnd,
            },
            transfer_required: transferRequired,
            notification_enabled: route.notificationEnabled,
          }
        } catch (error) {
          console.error('[save_commute_route]', error)
          return { saved: false, error: '儲存通勤路線失敗，請稍後再試' }
        }
      },
    }),

    get_commute_route: tool({
      description:
        '查詢使用者已儲存的通勤路線。使用者問「我的通勤路線是什麼」或要修改路線前先確認時使用。',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const route = await readRoute(userRef)
          return route
            ? {
                configured: true,
                route: {
                  origin: route.origin,
                  destination: route.destination,
                  mode: route.mode,
                  line: route.line,
                  city: route.city,
                  usual_days: route.usualDays,
                  usual_time_start: route.usualTimeStart,
                  usual_time_end: route.usualTimeEnd,
                },
              }
            : { configured: false, route: null }
        } catch (error) {
          console.error('[get_commute_route]', error)
          return { configured: false, route: null, error: '讀取通勤路線失敗' }
        }
      },
    }),
  }
}
