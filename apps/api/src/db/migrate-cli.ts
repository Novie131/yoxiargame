import { closeDb } from './client.ts'
import { migrate } from './migrate.ts'

try {
  await migrate()
} catch (error) {
  console.error('migration 失敗：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDb()
}
