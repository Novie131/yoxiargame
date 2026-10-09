import type { AppType } from '@api/app.ts'
import { hc } from 'hono/client'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 型別化的後端呼叫（Hono RPC）。
 *
 * 路徑、查詢參數、body 與回應的型別都是從後端的 AppType 推出來的 ——
 * 後端改了欄位或路徑，這邊會直接編譯失敗，而不是等到執行時才發現畫面空掉。
 *
 * 除了 /agent/chat（NDJSON 串流，見 lib/agent.ts）以外，前端呼叫後端一律走這裡。
 */

/*
 * 不需要知道「是誰」的端點，不帶 X-User-Ref。
 *
 * 帶了自訂標頭，瀏覽器就會先送一次 CORS 預檢（OPTIONS），而預檢的快取是按網址算的 ——
 * 站名搜尋每打一個字網址就不同，全部都帶的話等於請求數翻倍。
 *
 * 刻意列「不帶」的而不是「要帶」的：新端點漏列在這裡只是多一次預檢；
 * 反過來漏帶的話，後端會把人當成 dev-user（見 apps/api/src/identity.ts），
 * 讀寫到別人的資料，而且不會有任何錯誤。
 */
const PUBLIC_PATHS = ['/weather', '/geocode', '/transit', '/trip', '/ride']

/* API_URL 可能帶路徑前綴（例如 https://example.com/api），比對前先去掉 */
const BASE_PATH = new URL(API_URL).pathname.replace(/\/$/, '')

function isPublic(url: string): boolean {
  const path = new URL(url).pathname.slice(BASE_PATH.length)
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/* 標頭每次請求都重新取，X-User-Ref 是第一次啟動才產生的 */
function fetchWithUserRef(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  if (isPublic(url)) return fetch(input, init)

  const headers = new Headers(init?.headers)
  for (const [key, value] of Object.entries(userHeaders())) headers.set(key, value)
  return fetch(input, { ...init, headers })
}

export const api = hc<AppType>(API_URL, { fetch: fetchWithUserRef })

type LatLon = { lat: number; lon: number }

/*
 * 起訖座標 → 查詢參數。/trip/options 與 /ride/estimate 共用同一組參數。
 * URL 上只有字串，數字由後端（routes/validate.ts 的 parseFromTo）轉回來。
 */
export function coordsQuery(from: LatLon, to: LatLon) {
  return {
    fromLat: String(from.lat),
    fromLon: String(from.lon),
    toLat: String(to.lat),
    toLon: String(to.lon),
  }
}

/** 後端錯誤回應統一是 { error }，讀不到就退回狀態碼 */
export async function errorOf(res: Response): Promise<Error> {
  const detail = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(detail?.error ?? `伺服器回應 ${res.status}`)
}
