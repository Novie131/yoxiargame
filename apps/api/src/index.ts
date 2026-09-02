import { serve } from '@hono/node-server'

import { app } from './app.ts'

/* 本機開發用的 Node 進入點。部署到 Cloudflare Workers 時走 src/worker.ts */

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api listening on http://localhost:${port}`)
})
