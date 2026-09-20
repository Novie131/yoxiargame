import { useEffect, useSyncExternalStore } from 'react'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 「優先顯示無障礙路線」的偏好。
 *
 * 開啟後，路線卡會顯示轉乘站與出站口的電梯資訊。對推嬰兒車、拉行李、
 * 行動不便的人來說，「哪個出口有電梯」比路線快兩分鐘重要得多。
 *
 * ── 為什麼預設關閉 ──
 * 那段資訊對真正需要的人必須是顯眼的，而到處都顯示就等於沒有顯示。
 *
 * ── localStorage 是快取，不是歸屬 ──
 * 跟 interests.ts 同一套：真正的值在後端（user_preferences），
 * 這裡先讀本機讓畫面不閃，再跟後端對一次。
 */

const STORAGE_KEY = 'yoxi.accessibilityPriority'

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return false
  }
}

let enabled = load()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function writeCache(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
}

/* 只跟後端對一次。多個畫面同時掛載時不要各打一次。 */
let refreshed = false

async function fetchPreference(): Promise<boolean | null> {
  const res = await fetch(`${API_URL}/me/preferences`, { headers: userHeaders() })
  if (!res.ok) return null
  const body = (await res.json()) as { accessibilityPriority?: unknown }
  return typeof body.accessibilityPriority === 'boolean' ? body.accessibilityPriority : null
}

/**
 * 切換偏好。
 *
 * 先改本機再送出：開關是使用者期待「按下去就變」的東西。
 * 失敗就轉回去並拋出 —— 一個看起來開了但其實沒存的設定，
 * 會讓使用者在下一台裝置上找不到它，而且完全不知道為什麼。
 */
export async function setAccessibilityPriority(value: boolean): Promise<void> {
  const previous = enabled
  enabled = value
  writeCache(value)
  emit()

  try {
    const res = await fetch(`${API_URL}/me/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify({ accessibilityPriority: value }),
    })
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
    }
  } catch (error) {
    enabled = previous
    writeCache(previous)
    emit()
    throw error
  }
}

export function useAccessibilityPriority(): boolean {
  const current = useSyncExternalStore(subscribe, () => enabled)

  useEffect(() => {
    if (refreshed) return
    refreshed = true

    void fetchPreference()
      .then((value) => {
        if (value === null || value === enabled) return
        enabled = value
        writeCache(value)
        emit()
      })
      .catch(() => {
        /* 連不上後端就先沿用本機的值，下次開啟再試 */
        refreshed = false
      })
  }, [])

  return current
}
