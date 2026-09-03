import { useSyncExternalStore } from 'react'

/*
 * 使用者設定的通勤路線。
 *
 * 寫法刻意跟 lib/member.ts 一致：後端還沒有身分驗證
 * （tools.ts 一律記為 DEV_USER_REF，等於所有人共用一份資料），
 * 所以在登入流程做好之前，這裡先是純前端的 store。
 *
 * 之所以需要它：行程頁原本把「板橋站 → 市政府站」寫死在畫面上，
 * 新使用者一進來就看到一條不是自己設的路線。有了這個 store，
 * 沒設定過就顯示空狀態，設定完才出現卡片。
 *
 * 之後接上後端時，把 load/save 換成打 API 即可，畫面不用改。
 */

export type CommuteRoute = {
  /** 出發站，例如「板橋站」 */
  origin: string
  /** 目的站，例如「市政府站」 */
  destination: string
  /** 主要運具的路線名，例如「板南線」。用來查 TDX 即時狀態。 */
  line: string
  /** 預估通勤時間（分鐘）。目前由設定流程填入，還不是算出來的。 */
  durationMinutes: number
}

const STORAGE_KEY = 'yoxi.commuteRoute'

function load(): CommuteRoute | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { origin, destination, line, durationMinutes } = parsed as Partial<CommuteRoute>
    /* 少了起訖就不算一條路線，寧可當成沒設定過 */
    if (typeof origin !== 'string' || !origin.trim()) return null
    if (typeof destination !== 'string' || !destination.trim()) return null

    return {
      origin,
      destination,
      line: typeof line === 'string' && line.trim() ? line : '',
      durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : 0,
    }
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return null
  }
}

let route: CommuteRoute | null = load()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setCommuteRoute(next: CommuteRoute) {
  route = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(route))
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
  emit()
}

export function clearCommuteRoute() {
  route = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 同上 */
  }
  emit()
}

export function useCommuteRoute() {
  const current = useSyncExternalStore(subscribe, () => route)
  return { route: current, configured: current !== null }
}
