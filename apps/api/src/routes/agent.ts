import { Hono } from 'hono'

import { streamAgentReplyWithFallback, type ChatMessage } from '../agent/index.ts'
import { sanitizeMessages } from '../agent/sanitize.ts'
import { readUserRef } from '../identity.ts'
import type { UserLocation } from '../services/place.ts'

/*
 * 對話。
 *
 * 回應是 NDJSON 串流，Hono RPC 的型別描述不了，所以前端（lib/agent.ts）
 * 照舊用 fetch 讀，這裡也不套 routes/validate.ts。
 */

/*
 * 前端帶進來的定位。
 *
 * 座標不合法就當作沒有位置 —— 寧可讓畫面跳出「開啟定位」的卡片，
 * 也不要拿一個錯的座標去規劃，那會回一條看起來很正常但完全錯誤的路線。
 *
 * label 是前端已經知道的地名，純粹省一次反向地理編碼。它會進到系統提示裡，
 * 所以長度要有上限（agent/index.ts 還會再清一次換行）。
 */
const MAX_LOCATION_LABEL = 80

function parseLocation(value: unknown): UserLocation | null {
  if (typeof value !== 'object' || value === null) return null
  const o = value as Record<string, unknown>

  const lat = Number(o.lat)
  const lon = Number(o.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  const label =
    typeof o.label === 'string' && o.label.trim()
      ? o.label.trim().slice(0, MAX_LOCATION_LABEL)
      : null

  return { lat, lon, precise: o.precise === true, label }
}

export const agentRoutes = new Hono().post('/chat', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  let body: { messages?: unknown; location?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const result = sanitizeMessages(body.messages)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const messages: ChatMessage[] = result.messages
  const location = parseLocation(body.location)

  /*
   * NDJSON：一行一個 JSON 事件。
   *
   * 原本是純文字串流，但那樣前端只看得到字 —— 模型呼叫 save_commute_route
   * 把路線存好了，畫面卻不知道，要重開 App 才會更新。改成事件流之後，
   * 文字是 {"type":"text"}，狀態改變是 {"type":"commute_route"}。
   * 用換行分隔是安全的：JSON.stringify 會把內容裡的換行跳脫掉。
   */
  const encoder = new TextEncoder()
  const line = (event: unknown) => encoder.encode(`${JSON.stringify(event)}\n`)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAgentReplyWithFallback(messages, userRef, location)) {
          controller.enqueue(line(event))
        }
      } catch (error) {
        // 只記錄在伺服器端，不把內部訊息回給前端
        console.error('[agent/chat]', error)
        controller.enqueue(line({ type: 'error', message: '發生錯誤，請稍後再試' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
})
