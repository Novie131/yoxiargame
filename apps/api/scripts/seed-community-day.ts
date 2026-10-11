import { closeDb, hasDatabase } from '../src/db/client.ts'
import { DEMO_CAMPAIGN, seedDemoCommunityDay } from '../src/services/demo-community-day.ts'

/*
 * 手動把示範社群日砍掉重建（重新查座標、清掉所有人的完成紀錄）。
 *
 * 平常不用跑：本機 API（src/index.ts）啟動時與之後每 10 分鐘會自己維持這場活動
 * 「進行中」，換日時也會自動歸零。這支留著給「現在就要一場全新的」時用，
 * 例如 demo 前想把剛剛彩排打過的卡清掉。
 *
 * 地點與規則見 src/services/demo-community-day.ts。
 *
 * 執行：npm --prefix apps/api run seed:community-day
 */

async function main() {
  if (!hasDatabase()) {
    console.error('沒有設定 DATABASE_URL，無法寫入')
    process.exitCode = 1
    return
  }

  const count = await seedDemoCommunityDay((line) => console.log(line))
  console.log(`\n建立「${DEMO_CAMPAIGN}」，${count} 個任務點，從現在起 3 小時內有效（本機 API 開著會自動延長）。`)
}

try {
  await main()
} catch (error) {
  console.error('種子資料建立失敗：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDb()
}
