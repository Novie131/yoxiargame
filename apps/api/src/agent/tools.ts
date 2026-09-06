import { tool } from 'ai'
import { z } from 'zod'

import { hasDatabase } from '../db/client.ts'
import { findNearbyMissions } from '../db/repositories/missions.ts'
import { readRoute, saveRoute } from '../services/commute.ts'
import {
  resolvePlaceName,
  resolveUserLocation,
  type ResolvedPlace,
  type UserLocation,
} from '../services/place.ts'
import { planMetroRoutes } from '../services/route-planner.ts'
import {
  getBusStatus,
  getMetroStatus,
  hasTdxCredentials,
  haversineMeters,
  isBusCity,
} from '../services/tdx.ts'
import { getWeather } from '../services/weather.ts'

/*
 * Agent 可用的工具。
 *
 * 通勤路線、天氣、路徑規劃、捷運與公車即時狀態都已接上真實來源；
 * estimate_ride 仍回假資料，數值刻意對齊 Document/ 的設計稿，
 * 之後接真實來源時只要換掉 execute 的內容。
 *
 * 工具分兩類：
 *   sharedTools  跟使用者與位置都無關，模組層定義一次即可
 *   createTools  綁定這一次請求的使用者與位置，每次請求建立
 *
 * 之所以要分開：通勤路線必須寫在發話者身上（在有 createTools 之前，
 * 所有人都被記成同一個 'dev-user'），而位置是逐次請求變動的 ——
 * 使用者在板橋跟在信義區問「附近有什麼」，答案不該一樣。
 */

/*
 * 需要位置卻沒有位置時的回傳。
 *
 * 一定要是**結構化**的旗標而不是一句錯誤字串：agent/index.ts 看到
 * need_location 就會送一張「開啟定位／手動選擇」的卡片給前端，
 * 使用者按一下就解決了。只回文字的話，模型只能叫使用者「去設定裡打開」，
 * 而那句話在 App 裡是按不動的。
 */
const needLocation = (what: string) => ({
  error: `需要知道你的位置才能${what}`,
  need_location: true,
})

/** 解析結果 → 給模型看的形狀。走路時間一定要帶，那是誠實範圍的一部分。 */
const describe = (place: ResolvedPlace) => ({
  label: place.label,
  station: place.station?.name ?? null,
  walk_minutes_to_station: place.station?.walkMinutes ?? null,
  metro_reachable: place.metroReachable,
})

const sharedTools = {
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
    /*
     * 假資料，數值對齊 Document/yoxi-ride-estimate.png。
     * 注意這跟 trip-options.ts「沒有來源就不給數字」的立場是矛盾的 ——
     * 接上 yoxi 的估價 API 之前，這裡回的車資與時間都不能當真。
     */
    execute: async ({ from, to }) => ({
      from,
      to,
      distance_km: 8.5,
      duration_minutes: 15,
      fare_twd: { min: 250, max: 320 },
      eta: '14:25',
      data_source: 'mock',
    }),
  }),
}

/**
 * 綁定這一次請求的工具集。
 * userRef 來自 identity.readUserRef；location 是前端帶進來的定位，可能沒有。
 */
export function createTools(userRef: string, location?: UserLocation | null) {
  /*
   * 當前位置只解析一次。同一輪對話裡模型常常先查天氣再規劃路線，
   * 每個工具各解析一次的話，反向地理編碼與最近車站都會重複打。
   */
  let currentPlace: Promise<ResolvedPlace> | null = null
  const here = () => {
    if (!location) return null
    currentPlace ??= resolveUserLocation(location)
    return currentPlace
  }

  /* 有給地名就查地名，沒給就用當前位置。兩者都沒有時回 null。 */
  const resolve = async (name?: string): Promise<ResolvedPlace | null> => {
    const query = name?.trim()
    if (query) return resolvePlaceName(query)
    return (await here()) ?? null
  }

  return {
    ...sharedTools,

    get_weather: tool({
      description:
        '查詢天氣：目前的氣溫、體感溫度、天氣狀況、紫外線與降雨，' +
        '以及未來幾小時的降雨機率與溫度區間，並附上該穿什麼、要不要帶傘的建議。' +
        '使用者問天氣、要出門、或你要提醒他穿著與帶傘時使用。',
      inputSchema: z.object({
        place: z
          .string()
          .optional()
          .describe(
            '地點，例如「信義區」「台北車站」。' +
              '使用者問的是他所在地的天氣（「今天天氣如何」「等一下會下雨嗎」）時' +
              '**不要帶**這個參數，系統會用他的定位。',
          ),
      }),
      /*
       * 真實資料。查不到地點或外部服務掛掉時回傳 error 欄位，
       * 讓模型照實說「查不到」，而不是自己編一個溫度出來。
       */
      execute: async ({ place }) => {
        try {
          const resolved = await resolve(place)
          if (!resolved) {
            return place
              ? { place, error: `查不到「${place}」這個地點` }
              : needLocation('查你所在地的天氣')
          }

          const w = await getWeather(resolved.lat, resolved.lon)
          return {
            place: w.location ?? resolved.label,
            data_source: 'open-meteo',
            temperature_c: w.temperatureC,
            feels_like_c: w.feelsLikeC,
            humidity_percent: w.humidity,
            condition: w.condition,
            precipitation_mm: w.precipitationMm,
            uv_index: w.uvIndex,
            uv_level: w.uvLevel,
            /* 未來幾小時。回答「等一下要不要帶傘」全靠這一段。 */
            forecast: w.outlook && {
              hours: w.outlook.hours,
              min_temperature_c: w.outlook.minTemperatureC,
              max_temperature_c: w.outlook.maxTemperatureC,
              max_precipitation_probability: w.outlook.maxPrecipitationProbability,
              rain_starts_at: w.outlook.rainStartsAt,
              max_uv_index: w.outlook.maxUvIndex,
            },
            /* 已經按重要性排好，第一則就是最該講的 */
            advice: w.advices.map((a) => ({ kind: a.kind, title: a.title, body: a.body })),
            observed_at: w.observedAt,
          }
        } catch (error) {
          console.error('[get_weather]', error)
          return { place: place ?? null, error: '天氣服務暫時無法取得' }
        }
      },
    }),

    plan_route: tool({
      description:
        '規劃兩地之間的捷運路線，回傳建議路線與其他可選路線，' +
        '每條都含預估時間、轉乘次數與每一段搭哪條線，並含兩端的步行時間。' +
        '使用者問「怎麼去」「幫我安排到某地」「要多久」「要轉幾次車」時使用。',
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe(
            '出發地，例如「板橋」「台北 101」。' +
              '使用者說「從我這裡」「目前位置」或根本沒講出發地時**不要帶**，' +
              '系統會用他的定位。',
          ),
        to: z.string().describe('目的地，例如「台北車站」「市政府」「大安森林公園」'),
      }),
      /*
       * 時間的組成要講清楚，模型才不會把它說成保證值：
       * 行駛與停靠是 TDX 的實際數據，轉乘步行也是，只有轉乘等車是估計，
       * 兩端的步行時間則是由直線距離估的，而且完全沒有算「等第一班車」。
       */
      execute: async ({ from, to }) => {
        if (!hasTdxCredentials()) {
          return { from: from ?? null, to, error: 'TDX 金鑰未設定，無法規劃路線' }
        }

        try {
          const [origin, destination] = await Promise.all([resolve(from), resolvePlaceName(to)])

          if (!origin) {
            return from
              ? { from, to, error: `查不到「${from}」這個地點` }
              : needLocation('規劃從你現在的位置出發的路線')
          }
          if (!destination) return { from: origin.label, to, error: `查不到「${to}」這個地點` }

          if (!origin.station || !destination.station) {
            return {
              from: origin.label,
              to: destination.label,
              error: '這兩個地點之間沒有可用的捷運站，我沒辦法規劃捷運路線',
            }
          }

          /* 兩端最近的是同一站，代表捷運幫不上忙 —— 照實說，不要硬排一條路線 */
          if (origin.station.name === destination.station.name) {
            return {
              from: origin.label,
              to: destination.label,
              routes: [],
              same_station: origin.station.name,
              straight_line_meters: Math.round(
                haversineMeters(origin.lat, origin.lon, destination.lat, destination.lon),
              ),
              note: '兩地最近的捷運站是同一站，走路或叫車比較合理',
            }
          }

          const routes = await planMetroRoutes(origin.station.name, destination.station.name)
          if (!routes) {
            return {
              from: origin.label,
              to: destination.label,
              error: `查不到「${origin.station.name}」到「${destination.station.name}」的捷運路線`,
            }
          }

          const walk = origin.station.walkMinutes + destination.station.walkMinutes
          const plans = [routes.best, ...routes.alternatives]

          return {
            from: describe(origin),
            to: describe(destination),
            data_source: 'tdx',
            /* 建議路線的門到門時間：走到起站 + 車程 + 出站走到目的地 */
            total_minutes: walk + routes.best.totalMinutes,
            /* 第一條是建議路線，其餘是使用者可以自己選的替代方案 */
            routes: plans.map((p) => ({
              ride_minutes: p.totalMinutes,
              total_minutes: walk + p.totalMinutes,
              transfers: p.transfers,
              legs: p.legs,
            })),
            note:
              '時間為估計值，不含等第一班車的時間；兩端步行時間由直線距離估算' +
              (origin.metroReachable && destination.metroReachable
                ? ''
                : '。其中一端離捷運站較遠，這段路可能適合叫車'),
          }
        } catch (error) {
          console.error('[plan_route]', error)
          return { from: from ?? null, to, error: '路線規劃暫時無法使用' }
        }
      },
    }),

    search_activities: tool({
      description:
        '搜尋某個地點附近正在進行的探索任務，會回傳任務名稱、所屬活動與距離。' +
        '使用者問「附近有什麼好玩的」「這附近有什麼活動」時使用。',
      inputSchema: z.object({
        area: z
          .string()
          .optional()
          .describe(
            '地點，例如「大安森林公園」「信義區」。' +
              '使用者說「附近」「這裡」時**不要帶**，系統會用他的定位。',
          ),
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
       * 真實資料：地點先解析成座標，再用 PostGIS 的 ST_DWithin 查 missions，
       * 有帶 interests 就再做標籤交集（吃 GIN 索引）。
       *
       * 注意標籤裡**沒有**任何 Pokémon GO / Pikmin 的資料 —— 我們跟那兩款遊戲
       * 沒有實際整合，所以沒有任何任務掛那些標籤，也不該讓模型假裝有。
       */
      execute: async ({ area, interests }) => {
        if (!hasDatabase()) return { area: area ?? null, error: '任務資料庫未設定' }

        try {
          const resolved = await resolve(area)
          if (!resolved) {
            return area
              ? { area, error: `查不到「${area}」這個地點` }
              : needLocation('找你附近的任務')
          }

          const missions = await findNearbyMissions(
            resolved.lat,
            resolved.lon,
            3000,
            10,
            interests,
          )

          return {
            area: resolved.label,
            data_source: 'missions',
            filtered_by: interests ?? null,
            count: missions.length,
            missions: missions.map((m) => ({
              /* 前端的卡片用它做 deep link，直接打開那個任務的面板 */
              id: m.id,
              name: m.name,
              campaign: m.campaign,
              /*
               * 距離是相對於「查詢的那個地點」。使用者沒給地點時那就是他
               * 自己的位置，這時距離才等於「離你多遠」；有給地點時不是，
               * 所以欄位名一律講清楚是相對於哪裡。
               */
              distance_from_area_meters: m.distanceMeters,
              tags: m.tags,
              /* 座標是給前端的任務卡用的：沒有它就按不了「叫車前往」 */
              lat: m.lat,
              lon: m.lon,
            })),
            /* 模型要知道這批距離是不是「離使用者」的距離 */
            area_is_user_location: resolved.source === 'coordinates',
          }
        } catch (error) {
          console.error('[search_activities]', error)
          return { area: area ?? null, error: '任務搜尋暫時無法使用' }
        }
      },
    }),

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
