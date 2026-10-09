import { Hono } from 'hono'

import { hasDatabase } from '../db/client.ts'
import { getPreferences, savePreferences, type Preferences } from '../db/repositories/preferences.ts'
import { listCompletedMissions } from '../db/repositories/userMissions.ts'
import { readUserRef, USER_REF_PROVIDER } from '../identity.ts'
import { fail, json, ok, type Parsed } from './validate.ts'

/*
 * 這個人自己的東西：偏好設定、完成過的任務。
 *
 * 使用者由 X-User-Ref 標頭識別（identity.ts，不是身分驗證）。
 */

/** 局部更新：沒給的欄位維持原值 */
export type PreferencesBody = Partial<Preferences>

function parsePreferencesBody(body: unknown): Parsed<PreferencesBody> {
  const { interests, discoveryEnabled, accessibilityPriority } = (body ?? {}) as {
    interests?: unknown
    discoveryEnabled?: unknown
    accessibilityPriority?: unknown
  }

  if (interests !== undefined) {
    if (!Array.isArray(interests) || interests.some((i) => typeof i !== 'string')) {
      return fail('interests 必須是字串陣列')
    }
    /* 擋住異常長度的輸入寫進資料庫；標籤本來就只有十來個 */
    if (interests.length > 50) return fail('interests 過多')
  }
  if (discoveryEnabled !== undefined && typeof discoveryEnabled !== 'boolean') {
    return fail('discoveryEnabled 必須是布林值')
  }
  if (accessibilityPriority !== undefined && typeof accessibilityPriority !== 'boolean') {
    return fail('accessibilityPriority 必須是布林值')
  }

  return ok({
    interests: interests as string[] | undefined,
    discoveryEnabled: discoveryEnabled as boolean | undefined,
    accessibilityPriority: accessibilityPriority as boolean | undefined,
  })
}

const DEFAULT_PREFERENCES: Preferences = {
  interests: [],
  discoveryEnabled: true,
  accessibilityPriority: false,
}

export const meRoutes = new Hono()
  /*
   * 使用者偏好。
   *
   * 興趣同時存在前端 localStorage（即時的畫面狀態）與這裡（後端輪詢要看得到）。
   * 只有「主動推薦」需要後端那一份 —— 沒有它，反向導流就篩不了興趣。
   */
  .get('/preferences', async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))
    if (!hasDatabase()) return c.json(DEFAULT_PREFERENCES, 200)

    try {
      const prefs = await getPreferences(userRef, USER_REF_PROVIDER)
      c.header('Cache-Control', 'private, no-store')
      return c.json(prefs, 200)
    } catch (error) {
      console.error('[me/preferences:get]', error)
      return c.json({ error: '讀取偏好失敗' }, 502)
    }
  })

  .put('/preferences', json<PreferencesBody, PreferencesBody>(parsePreferencesBody), async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))

    /* 沒有資料庫時就是存不了，照實說而不是假裝成功 */
    if (!hasDatabase()) return c.json({ error: '偏好儲存未啟用' }, 503)

    try {
      const saved = await savePreferences(userRef, USER_REF_PROVIDER, c.req.valid('json'))
      return c.json(saved, 200)
    } catch (error) {
      console.error('[me/preferences:put]', error)
      return c.json({ error: '儲存偏好失敗' }, 502)
    }
  })

  /*
   * 這個人完成過的任務。給會員頁與成就用。
   *
   * 沒有資料庫時回空陣列而不是錯誤：那是「還沒完成任何任務」的合理呈現，
   * 而且這是輔助內容，不該擋住整頁。
   */
  .get('/missions', async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))

    if (!hasDatabase()) return c.json({ missions: [] }, 200)

    try {
      const missions = await listCompletedMissions(userRef, USER_REF_PROVIDER)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ missions }, 200)
    } catch (error) {
      console.error('[me/missions]', error)
      return c.json({ error: '任務紀錄暫時無法取得' }, 502)
    }
  })
