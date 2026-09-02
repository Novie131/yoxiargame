import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { db, withTransaction } from './client.ts'

/*
 * Migration 執行器。
 * 讀 infra/postgres/migrations/*.sql，依檔名排序，未套用過的才執行。
 * 每一支在自己的交易裡跑，失敗就整支 rollback。
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/postgres/migrations',
)

async function ensureMigrationsTable(): Promise<void> {
  await (await db()).query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await (await db()).query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  )
  return new Set(rows.map((r) => r.filename))
}

export async function migrate(): Promise<void> {
  await ensureMigrationsTable()
  const applied = await appliedFilenames()

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log(`沒有待套用的 migration（已套用 ${applied.size} 支）`)
    return
  }

  for (const filename of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
    await withTransaction(async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        filename,
      ])
    })
    console.log(`✓ ${filename}`)
  }

  console.log(`完成，套用了 ${pending.length} 支 migration`)
}

