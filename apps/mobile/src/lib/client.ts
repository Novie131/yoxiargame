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
 * 目前只有 /commute 這組有型別（見 apps/api/src/app.ts 的 AppType），
 * 其他端點還是用 fetch 直接打，搬過去之後再改用這個。
 *
 * headers 每次請求都重新取，X-User-Ref 是第一次啟動才產生的。
 */
export const api = hc<AppType>(API_URL, { headers: userHeaders })

/** 後端錯誤回應統一是 { error }，讀不到就退回狀態碼 */
export async function errorOf(res: Response): Promise<Error> {
  const detail = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(detail?.error ?? `伺服器回應 ${res.status}`)
}
