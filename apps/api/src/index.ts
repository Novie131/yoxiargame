import { serve } from '@hono/node-server'

import { app } from './app.ts'
import { pollTransit } from './services/transit-watch.ts'

/* 本機開發用的 Node 進入點。部署到 Cloudflare Workers 時走 src/worker.ts */

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api listening on http://localhost:${port}`)
})

/*
 * 交通監看的排程。
 *
 * Workers 那邊用 Cron Trigger，Node 這邊沒有排程器，就用 setInterval。
 * 兩邊呼叫的是同一個 pollTransit，行為一致。
 *
 * 間隔預設 120 秒，刻意不小於 tdx.ts 的 ALERT_TTL_MS（60 秒）——
 * 那樣輪詢會直接命中使用者請求也在用的快取，額外的 TDX 呼叫接近零。
 * 設成 0 可以關掉（例如跑測試時不想動到外部服務）。
 */
const intervalSeconds = Number(process.env.TRANSIT_WATCH_INTERVAL_SECONDS ?? 120)

if (intervalSeconds > 0) {
  const timer = setInterval(() => {
    pollTransit()
      .then((r) => {
        /* 沒事發生就別洗版，只在真的產生通知或失敗時記錄 */
        if (!r.ok) console.warn('[transit-watch] 略過：', r.reason)
        else if (r.created > 0) console.log('[transit-watch]', JSON.stringify(r))
      })
      .catch((e: unknown) => console.error('[transit-watch] 失敗：', e))
  }, intervalSeconds * 1000)

  /* 不要因為這個計時器而讓程序無法結束 */
  timer.unref()
  console.log(`transit-watch 已啟用，每 ${intervalSeconds} 秒一輪`)
} else {
  console.log('transit-watch 已停用（TRANSIT_WATCH_INTERVAL_SECONDS=0）')
}
