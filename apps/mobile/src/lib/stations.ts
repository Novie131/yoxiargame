import { useEffect, useState } from 'react'

import { API_URL } from './api'

/*
 * 捷運站名建議，資料來自後端的 /transit/stations（後端再打 TDX）。
 *
 * 設定通勤路線時一定要讓使用者從清單裡選，不能自由打字：
 * 站名要對得上 TDX，之後查即時狀態、推導路線名才有東西可對。
 *
 * 站表是靜態資料，後端快取一天，所以這裡不用做額外的節流，
 * 只要擋住「打字打到一半就送出去的舊請求蓋掉新結果」即可。
 */

export type Station = {
  stationId: string
  name: string
  /** 這一站經過的路線名，轉乘站會有多條 */
  lines: string[]
}

/* 輸入變動到送出請求之間的等待。純粹是少打幾次，不是配額問題。 */
const DEBOUNCE_MS = 250

export function useStationSuggestions(query: string): Station[] {
  /*
   * 連同「這批結果是哪個字查來的」一起存。
   * 只存 stations 的話，使用者改了字之後、新結果回來之前，
   * 畫面會拿舊字的建議配新字 —— 看起來像是選單沒反應。
   */
  const [result, setResult] = useState<{ query: string; stations: Station[] }>({
    query: '',
    stations: [],
  })

  const q = query.trim()

  useEffect(() => {
    if (!q) return

    let alive = true
    const timer = setTimeout(() => {
      fetch(`${API_URL}/transit/stations?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((body: { stations?: Station[] }) => {
          if (alive) setResult({ query: q, stations: body.stations ?? [] })
        })
        .catch(() => {
          /*
           * 查不到建議不該擋住設定流程 —— 使用者還是可以自己把站名打完。
           * 後端沒設 TDX 金鑰時會一直落在這裡，那是預期內的。
           */
          if (alive) setResult({ query: q, stations: [] })
        })
    }, DEBOUNCE_MS)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  /* 還沒查到這個字的結果就先不給，不要拿上一個字的清單頂替 */
  return result.query === q ? result.stations : []
}
