import { useEffect, useSyncExternalStore } from 'react'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 通知收件匣。
 *
 * 內容不是前端產生的 —— 後端的 services/transit-watch.ts 每兩分鐘比對一次
 * 捷運事件與使用者的通勤路線，命中就寫一則通知。這裡只負責讀、標記已讀，
 * 以及讓行程頁的鈴鐺顯示真實的未讀數。
 *
 * 送達管道只有這一個：App 開著的時候定時重抓。系統層的推播（App 關著也會跳）
 * 目前不做 —— 它需要 APNs 金鑰與 Apple Developer 帳號，成本與這階段的價值不成比例。
 * 這不影響現在的設計：真要加的時候，資料層就是這一套，只是多一個送達管道。
 */

export type AppNotification = {
  id: string
  kind: string
  title: string
  body: string
  /** 點下去要去哪，例如 /ride/estimate?from=…&to=… */
  actionRoute: string | null
  actionLabel: string | null
  createdAt: string
  read: boolean
}

type State = {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  error: string | null
}

let state: State = { notifications: [], unreadCount: 0, loading: false, error: null }
const listeners = new Set<() => void>()

function patch(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function isNotification(value: unknown): value is AppNotification {
  if (typeof value !== 'object' || value === null) return false
  const n = value as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.body === 'string' &&
    typeof n.createdAt === 'string'
  )
}

/* 同時有多個畫面掛載時只實際打一次 */
let inflight: Promise<void> | null = null

export function refresh(): Promise<void> {
  if (inflight) return inflight

  patch({ loading: true })
  inflight = fetch(`${API_URL}/notifications`, { headers: userHeaders() })
    .then(async (res) => {
      if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)
      const body = (await res.json()) as { notifications?: unknown; unreadCount?: unknown }
      const notifications = Array.isArray(body.notifications)
        ? body.notifications.filter(isNotification)
        : []

      patch({
        notifications,
        /* 未讀數以實際清單為準，不要相信兩個可能對不起來的數字 */
        unreadCount: notifications.filter((n) => !n.read).length,
        error: null,
      })
    })
    .catch((error: unknown) => {
      /* 通知拿不到不該擋住任何畫面，記下來就好 */
      patch({ error: error instanceof Error ? error.message : '無法取得通知' })
    })
    .finally(() => {
      patch({ loading: false })
      inflight = null
    })

  return inflight
}

/** id 給了就標那一則，沒給就全部標成已讀 */
export async function markRead(id?: string): Promise<void> {
  /*
   * 先改本機再送出。標記已讀是不會失敗到需要回滾的操作，
   * 讓紅點立刻消失比等一趟往返重要。
   */
  patch({
    notifications: state.notifications.map((n) =>
      !id || n.id === id ? { ...n, read: true } : n,
    ),
    unreadCount: id
      ? Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id)?.read ? 0 : 1))
      : 0,
  })

  try {
    await fetch(`${API_URL}/notifications/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify(id ? { id } : {}),
    })
  } catch {
    /* 送不出去就下次 refresh 時自己修正回來 */
  }
}

/* App 開著時的重抓間隔。跟後端的輪詢一致，再密也不會有新東西。 */
const REFRESH_MS = 120 * 1000

export function useNotifications(poll = false) {
  const current = useSyncExternalStore(subscribe, () => state)

  useEffect(() => {
    void refresh()
    if (!poll) return

    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [poll])

  return current
}
