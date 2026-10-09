import { Hono } from 'hono'

import { hasDatabase } from '../db/client.ts'
import { listNotifications, markRead } from '../db/repositories/notifications.ts'
import { readUserRef, USER_REF_PROVIDER } from '../identity.ts'
import { fail, json, ok, type Parsed } from './validate.ts'

/*
 * 通知收件匣。
 *
 * 內容是由 services/transit-watch.ts 的輪詢主動寫進來的，這裡只負責讀與標記已讀。
 * 未讀數就是這裡算出來的 —— 行程頁鈴鐺上的數字第一次有真實來源。
 */

/** 帶 id 就標那一則，不帶就全部標成已讀 */
type ReadBody = { id?: string }

function parseReadBody(body: unknown): Parsed<ReadBody> {
  const { id } = (body ?? {}) as { id?: unknown }
  /* 不是字串就當沒帶 —— 原本就是這樣，= 全部標已讀 */
  if (typeof id !== 'string') return ok({})
  return /^[0-9a-f-]{36}$/i.test(id) ? ok({ id }) : fail('id 格式錯誤')
}

export const notificationRoutes = new Hono()
  .get('/', async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))

    if (!hasDatabase()) return c.json({ notifications: [], unreadCount: 0 }, 200)

    try {
      const result = await listNotifications(userRef, USER_REF_PROVIDER)
      /* 每個人的收件匣都不一樣，不能讓中間層快取 */
      c.header('Cache-Control', 'private, no-store')
      return c.json(result, 200)
    } catch (error) {
      console.error('[notifications:get]', error)
      return c.json({ error: '讀取通知失敗' }, 502)
    }
  })

  /* 沒有 body 是合法的（= 全部標已讀），所以解析失敗不算錯誤 */
  .post('/read', json<ReadBody, ReadBody>(parseReadBody, { optional: true }), async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))

    if (!hasDatabase()) return c.json({ marked: 0 }, 200)

    try {
      const marked = await markRead(userRef, USER_REF_PROVIDER, c.req.valid('json').id)
      return c.json({ marked }, 200)
    } catch (error) {
      console.error('[notifications:read]', error)
      return c.json({ error: '標記已讀失敗' }, 502)
    }
  })
