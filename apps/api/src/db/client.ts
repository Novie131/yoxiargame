import { Pool } from 'pg'

/*
 * 資料庫連線池。連線字串對應 infra/compose 的 postgres 服務：
 *   postgres://movequest:movequest@localhost:5432/movequest
 */

let pool: Pool | undefined

export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('缺少環境變數 DATABASE_URL，請參考 apps/api/.env.example')
    }
    pool = new Pool({
      connectionString,
      max: 10,
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
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect()
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
