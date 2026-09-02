import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReplyWithFallback, type ChatMessage } from './agent/index.ts'
import { hasDatabase } from './db/client.ts'

const app = new Hono()

app.use('/*', cors())

app.get('/health', (c) =>
  c.json({
    ok: true,
    provider: process.env.LLM_PROVIDER ?? 'nvidia',
    database: hasDatabase() ? 'connected' : 'disabled',
  }),
)

app.post('/agent/chat', async (c) => {
  const body = await c.req.json<{ messages?: ChatMessage[] }>()
  const messages = body.messages

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages 為必填，且不可為空陣列' }, 400)
  }

  // 純文字串流，前端直接讀 response.body 即可，不用實作額外協定
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamAgentReplyWithFallback(messages)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (error) {
        console.error('[agent/chat]', error)
        // 串流已經開始，無法改回 500，只能在內容尾端附上錯誤訊息
        controller.enqueue(encoder.encode('\n\n[發生錯誤，請稍後再試]'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api listening on http://localhost:${port}`)
})
