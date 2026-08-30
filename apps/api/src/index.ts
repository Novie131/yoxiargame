import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReply, type ChatMessage } from './agent/index.ts'

const app = new Hono()

app.use('/*', cors())

app.get('/health', (c) => c.json({ ok: true, provider: process.env.LLM_PROVIDER ?? 'nvidia' }))

app.post('/agent/chat', async (c) => {
  const body = await c.req.json<{ messages?: ChatMessage[] }>()
  const messages = body.messages

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages 為必填，且不可為空陣列' }, 400)
  }

  try {
    // 純文字串流，前端直接讀 response.body 即可，不用實作額外協定
    return streamAgentReply(messages).toTextStreamResponse()
  } catch (error) {
    console.error('[agent/chat]', error)
    return c.json({ error: error instanceof Error ? error.message : '未知錯誤' }, 500)
  }
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api listening on http://localhost:${port}`)
})
