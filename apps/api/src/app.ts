import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReplyWithFallback, type ChatMessage } from './agent/index.ts'
import { sanitizeMessages } from './agent/sanitize.ts'
import { hasDatabase } from './db/client.ts'

/*
 * Hono app 本體。Node（src/index.ts）與 Cloudflare Workers（src/worker.ts）
 * 兩個進入點共用這個檔案，行為完全一致。
 */

export const app = new Hono()

/*
 * CORS：正式環境只允許自己的前端網域。
 * 沒設定 ALLOWED_ORIGINS 時全開，方便本機開發；
 * 部署時務必設定，否則任何網站都能呼叫這個後端、消耗你的 API 額度。
 */
app.use('/*', (c, next) => {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  return cors({
    origin: configured.length ? configured : '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next)
})

app.get('/health', (c) =>
  c.json({
    ok: true,
    provider: process.env.LLM_PROVIDER ?? 'nvidia',
    database: hasDatabase() ? 'connected' : 'disabled',
  }),
)

app.post('/agent/chat', async (c) => {
  let body: { messages?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const result = sanitizeMessages(body.messages)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const messages: ChatMessage[] = result.messages

  // 純文字串流，前端直接讀 response.body 即可，不用實作額外協定
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamAgentReplyWithFallback(messages)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (error) {
        // 只記錄在伺服器端，不把內部訊息回給前端
        console.error('[agent/chat]', error)
        controller.enqueue(encoder.encode('\n\n[發生錯誤，請稍後再試]'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
})
