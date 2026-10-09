import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { agentRoutes } from './routes/agent.ts'
import { campaignRoutes } from './routes/campaigns.ts'
import { commuteRoutes } from './routes/commute.ts'
import { meRoutes } from './routes/me.ts'
import { missionRoutes } from './routes/missions.ts'
import { notificationRoutes } from './routes/notifications.ts'
import { placeRoutes } from './routes/place.ts'
import { systemRoutes } from './routes/system.ts'
import { transitRoutes } from './routes/transit.ts'
import { rideRoutes, tripRoutes } from './routes/trip.ts'

/*
 * Hono app 本體。Node（src/index.ts）與 Cloudflare Workers（src/worker.ts）
 * 兩個進入點共用這個檔案，行為完全一致。
 *
 * 這裡只做兩件事：CORS，以及把 routes/ 底下的各組路由掛上來。
 * 每支端點的說明在各自的檔案裡。
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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    /* X-User-Ref 是前端帶的裝置識別，見 identity.ts —— 不是身分驗證 */
    allowHeaders: ['Content-Type', 'X-User-Ref'],
    maxAge: 86400,
  })(c, next)
})

/*
 * 前端用 Hono RPC（hc）呼叫的路由。
 *
 * 一定要串成一條鏈 —— AppType 是從這條鏈的回傳值推出來的，
 * 拆成好幾行 `app.route(...)` 的話型別不會累積，前端拿到的會是空的。
 * 新增一組路由時：在 routes/ 開一個檔案（同樣用鏈式寫法），再串到這裡。
 */
const routes = app
  .route('/', placeRoutes)
  .route('/transit', transitRoutes)
  .route('/me', meRoutes)
  .route('/missions', missionRoutes)
  .route('/campaigns', campaignRoutes)
  .route('/trip', tripRoutes)
  .route('/ride', rideRoutes)
  .route('/commute', commuteRoutes)
  .route('/notifications', notificationRoutes)

export type AppType = typeof routes

/*
 * 不進 AppType 的路由：
 *   system  /health 與 /internal/poll，維運用，前端不呼叫
 *   agent   /agent/chat 是 NDJSON 串流，RPC 的型別描述不了，前端照舊用 fetch
 */
app.route('/', systemRoutes)
app.route('/agent', agentRoutes)
