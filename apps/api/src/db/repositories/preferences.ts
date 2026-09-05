import { withTransaction } from '../client.ts'

/*
 * 使用者偏好。
 *
 * 存在的理由很具體：反向導流的輪詢跑在後端，它必須自己回答「這個人對什麼有興趣」。
 * 興趣原本只存在瀏覽器的 localStorage，後端完全看不到，所以只要是「主動」的功能
 * 就一定要有這一份。前端仍然保留 localStorage 當即時的畫面狀態，這裡是同步的副本。
 */

export type Preferences = {
  /** 值與探索頁 chips 的 id 一致（food、coffee、sport…） */
  interests: string[]
  /** 關掉就不會收到地點推薦。跟交通異常通知的開關分開。 */
  discoveryEnabled: boolean
}

export const DEFAULT_PREFERENCES: Preferences = { interests: [], discoveryEnabled: true }

async function upsertUserRef(
  client: import('pg').PoolClient,
  provider: string,
  externalRef: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO external_user_refs (provider, external_ref)
     VALUES ($1, $2)
     ON CONFLICT (provider, external_ref) DO UPDATE SET provider = EXCLUDED.provider
     RETURNING id`,
    [provider, externalRef],
  )
  return rows[0].id
}

export async function getPreferences(
  externalUserRef: string,
  provider: string,
): Promise<Preferences> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ interests: string[]; discovery_enabled: boolean }>(
      `SELECT p.interests, p.discovery_enabled
         FROM user_preferences p
         JOIN external_user_refs u ON u.id = p.user_ref_id
        WHERE u.provider = $1 AND u.external_ref = $2`,
      [provider, externalUserRef],
    )
    const row = rows[0]
    /* 沒設定過就是預設值，不要為了讀取而建立一列 */
    if (!row) return DEFAULT_PREFERENCES

    return { interests: row.interests ?? [], discoveryEnabled: row.discovery_enabled }
  })
}

export async function savePreferences(
  externalUserRef: string,
  provider: string,
  input: Partial<Preferences>,
): Promise<Preferences> {
  return withTransaction(async (client) => {
    const userRefId = await upsertUserRef(client, provider, externalUserRef)

    const { rows } = await client.query<{ interests: string[]; discovery_enabled: boolean }>(
      `INSERT INTO user_preferences (user_ref_id, interests, discovery_enabled)
       VALUES ($1, COALESCE($2::text[], '{}'), COALESCE($3::boolean, true))
       ON CONFLICT (user_ref_id) DO UPDATE SET
         /* 只更新有給的欄位，沒給的保持原狀 */
         interests = COALESCE($2::text[], user_preferences.interests),
         discovery_enabled = COALESCE($3::boolean, user_preferences.discovery_enabled),
         updated_at = now()
       RETURNING interests, discovery_enabled`,
      [userRefId, input.interests ?? null, input.discoveryEnabled ?? null],
    )

    return { interests: rows[0].interests ?? [], discoveryEnabled: rows[0].discovery_enabled }
  })
}
