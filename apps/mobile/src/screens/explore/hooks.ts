import { useNavigate } from 'react-router'

import { sendMessage } from '@/lib/conversation'
import { useWeather } from '@/lib/weather'

/*
 * 探索頁與情境小行程共用的 hook。跟 parts.tsx 分開放，
 * 那個檔案只放元件，fast refresh 才不會整頁重載。
 */

/*
 * 交給首頁的 Agent 對話。
 *
 * 搜尋、「更多主題」、「說說你想怎麼調整」都走這裡：真的地點資料在 Agent 那邊
 * （它查得到路線、天氣、附近任務），這幾頁的店家只是示意。
 * 不 await —— 送出後馬上切到對話頁，讓使用者看著它回覆。
 */
export function useAskAgent() {
  const navigate = useNavigate()
  return (text: string) => {
    void sendMessage(text)
    navigate('/')
  }
}

export type Sky = ReturnType<typeof useSky>

/*
 * 三張稿的標題下都有同一組天氣：「板橋區・22°C 有雨」「降雨機率80%・體感21°C・07:50更新」。
 * 全部來自 /weather 的即時資料，沒有寫死。
 */
export function useSky() {
  const weather = useWeather()
  if (weather.status !== 'ready') {
    return { status: weather.status, rainy: false } as const
  }
  const w = weather.weather
  const rainChance = w.outlook?.maxPrecipitationProbability ?? null
  /* 正在下、或接下來幾小時很可能下，才算「雨天」—— 標題要跟著真的天氣走 */
  const rainy = w.precipitationMm > 0 || w.condition.includes('雨') || (rainChance ?? 0) >= 50
  return {
    status: 'ready',
    rainy,
    /* 沒定位時是退路座標，要講清楚不是他的所在地 */
    place: `${w.district ?? w.location ?? '目前位置'}${weather.precise ? '' : '（預設位置）'}`,
    temperature: w.temperatureC,
    condition: w.condition === '—' ? '' : w.condition,
    feelsLike: w.feelsLikeC,
    rainChance,
    /* Open-Meteo 給的是當地時間的「YYYY-MM-DDTHH:MM」 */
    updated: w.observedAt.slice(11, 16),
  } as const
}

