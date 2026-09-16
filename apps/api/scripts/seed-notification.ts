import { closeDb, hasDatabase, withTransaction } from '../src/db/client.ts'
import { upsertNotification } from '../src/db/repositories/notifications.ts'
import { USER_REF_PROVIDER } from '../src/identity.ts'

/*
 * Demo 用的通知種子。
 *
 * 用途：讓「通勤異常 → 主動通知 → 一鍵改叫車」這條主線演示得出來。
 *
 * 為什麼需要它：通知是 services/transit-watch.ts 在**真的**有捷運事件時才產生的。
 * 捷運大部分時候是正常的，所以收件匣通常是空的 —— 那是正確的狀態，
 * 但 demo 當下沒辦法要求北捷配合出事。
 *
 * 這支腳本寫的是一則**標示清楚的示範通知**，內容與真實通知走同一張表、
 * 同一個 upsert、同一個動作路由，所以畫面行為完全一致。
 * provider 用 'demo-seed' 而不是 TDX，真實輪詢不會覆蓋或誤判它，
 * 要清掉也只要刪這個 provider 的列。
 *
 * 執行：
 *   npm --prefix apps/api run seed:notification -- <裝置的 X-User-Ref>
 *
 * 裝置的 ref 在前端的 localStorage 'yoxi.userRef'（見 mobile 的 lib/userRef.ts），
 * 或直接從瀏覽器 DevTools 複製。不給就用開發預設值 dev-user。
 */

const PROVIDER = 'demo-seed'

/* 對齊設計稿 my-station-crisis.png 的情境：板南線事故 */
const DEMO = {
  line: '板南線',
  title: '板南線有異常',
  body: '市政府往永寧方向因號誌異常，列車行駛時間延長約 10 分鐘，建議改採其他運具。',
  /* 起訖用設計稿那條通勤路線。真實通知是用使用者自己存的路線帶入。 */
  from: '板橋',
  to: '市政府',
}

async function main() {
  if (!hasDatabase()) {
    console.error('沒有資料庫連線。先 npm run db:up，並確認 apps/api/.env 的 DATABASE_URL。')
    process.exitCode = 1
    return
  }

  const externalRef = process.argv[2]?.trim() || 'dev-user'

  await withTransaction(async (client) => {
    /*
     * 使用者列可能還不存在（這台裝置沒存過通勤路線）。
     * 這裡建一列是安全的 —— external_user_refs 只是「這個裝置識別碼對應到誰」，
     * 不含任何個資。
     */
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO external_user_refs (provider, external_ref)
       VALUES ($1, $2)
       ON CONFLICT (provider, external_ref) DO UPDATE SET provider = EXCLUDED.provider
       RETURNING id`,
      [USER_REF_PROVIDER, externalRef],
    )
    const userRefId = rows[0].id

    const params = new URLSearchParams({ from: DEMO.from, to: DEMO.to })

    const outcome = await upsertNotification(client, {
      userRefId,
      kind: 'transit_disruption',
      title: DEMO.title,
      body: DEMO.body,
      /*
       * 通知的價值在「接下來怎麼辦」，所以帶著改叫車的動作。
       * 只有地名沒有座標 —— 跟真實通知一樣，估價頁會自己查（useResolvedPlace）。
       */
      actionRoute: `/ride/estimate?${params}`,
      actionLabel: '改叫計程車',
      provider: PROVIDER,
      externalEventId: 'demo-bannan-signal-fault',
      disruptionId: null,
    })

    console.log(
      `✓ 已為 ${externalRef} ${outcome === 'created' ? '建立' : '更新'}一則示範通知（${DEMO.line}）`,
    )
    console.log('  清除：DELETE FROM notifications WHERE provider = \'demo-seed\';')
  })
}

try {
  await main()
} finally {
  await closeDb()
}
