import type { Pool, PoolClient } from 'pg'

/*
 * 資料庫連線池。連線字串對應 infra/compose 的 postgres 服務：
 *   postgres://movequest:movequest@localhost:5432/movequest
 */

let pool: Pool | undefined

/*
 * Hyperdrive 綁定進來的連線字串（Workers 專用，由 worker.ts 在每次請求時設定）。
 *
 * Workers 不能開任意 TCP 連線，所以 pg 原本在上面是死的。Hyperdrive 的作用是
 * 在 Cloudflare 邊緣代理這條連線並自己維護連線池，Worker 這端照樣用 pg 的介面，
 * 只是連線字串換成它給的那一條。因此整個 repo 其餘地方完全不用改。
 *
 * Node 部署上這個值是 undefined，走 DATABASE_URL。
 */
let hyperdriveUrl: string | undefined

/** Workers 上用 Hyperdrive 的連線字串取代 DATABASE_URL。見 worker.ts */
export function useHyperdrive(connectionString: string): void {
  /* 同一次部署裡這個值是固定的，第二次之後直接返回，不要把連線池丟掉重建 */
  if (connectionString === hyperdriveUrl) return
  hyperdriveUrl = connectionString
  pool = undefined
}

function connectionString(): string | undefined {
  return hyperdriveUrl ?? process.env.DATABASE_URL
}

/*
 * 資料庫是選配的。
 * Demo 部署時常常只想跑前端與 Agent，不想另外開一台 Postgres，
 * 所以兩個來源都沒有時要能正常啟動，只是寫入類的工具會停用。
 */
export function hasDatabase(): boolean {
  return Boolean(connectionString())
}

/*
 * pg 是頂層 import 的話，光是載入模組就會讓沒有 nodejs_compat 的環境啟動失敗。
 * 改成動態載入 —— demo 模式兩個連線字串都沒有，就完全不會走到這裡，
 * 也就不會把 pg 拉進 bundle。
 */
export async function db(): Promise<Pool> {
  if (!pool) {
    const url = connectionString()
    if (!url) {
      throw new Error(
        '沒有資料庫連線：Node 需要 DATABASE_URL（見 apps/api/.env.example），' +
          'Workers 需要 wrangler.toml 的 Hyperdrive 綁定',
      )
    }
    const { Pool: PgPool } = await import('pg')
    pool = new PgPool({
      connectionString: url,
      /*
       * Workers 上刻意開小：Hyperdrive 已經在邊緣做了連線池，
       * Worker 這端每個 isolate 只服務少量併發請求，開大只是佔著上游連線數。
       */
      max: hyperdriveUrl ? 5 : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    pool.on('error', (err) => console.error('[db] 連線池錯誤', err))
  }
  return pool
}

export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = undefined
}

/** 在單一交易內執行，拋錯自動 rollback */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await db()).connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
