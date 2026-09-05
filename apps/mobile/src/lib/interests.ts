import { useEffect, useSyncExternalStore } from 'react'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 使用者選的興趣標籤。
 *
 * 值必須跟 missions.tags 一致（後端 seed-missions.ts 用的就是這組 id），
 * 對不上的話篩選會靜默地永遠篩不到東西。
 *
 * 存兩份，各有各的用途：
 *   localStorage  畫面的即時狀態，切換 chip 不用等網路
 *   後端          反向導流的輪詢跑在伺服器上，它必須自己看得到興趣才篩得動
 *
 * 同步是單向的（本機 → 後端）而且失敗不擋畫面 —— 篩選是本機在做的，
 * 送不出去只影響「主動推薦」的準確度，下次改動時會再送一次。
 */

export type Interest = {
  id: string
  label: string
  /*
   * 這個標籤目前有沒有對應的任務資料。
   *
   * Pokémon GO 與 Pikmin 留在畫面上是因為它們是產品方向的一部分，
   * 但我們跟那兩款遊戲沒有實際整合，資料庫裡也沒有任何任務掛這些標籤 ——
   * 所以選了會是空的。與其讓使用者以為壞了，不如在畫面上照實說。
   */
  hasData: boolean
}

export const INTERESTS: Interest[] = [
  { id: 'pokemon-go', label: 'Pokémon GO 寶可夢 GO', hasData: false },
  { id: 'pikmin', label: 'Pikmin 皮克敏', hasData: false },
  { id: 'food', label: '美食', hasData: true },
  { id: 'travel', label: '旅行', hasData: true },
  { id: 'sport', label: '運動', hasData: true },
  { id: 'music', label: '音樂', hasData: true },
  { id: 'photo', label: '攝影', hasData: true },
  { id: 'reading', label: '閱讀', hasData: true },
  { id: 'movie', label: '電影', hasData: true },
  { id: 'tech', label: '科技', hasData: true },
  { id: 'bar', label: '酒吧', hasData: true },
  { id: 'coffee', label: '咖啡', hasData: true },
]

const STORAGE_KEY = 'yoxi.interests'
const VALID = new Set(INTERESTS.map((i) => i.id))

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    /* 過濾掉已經不存在的 id，免得舊資料讓篩選永遠沒有結果 */
    return parsed.filter((x): x is string => typeof x === 'string' && VALID.has(x))
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return []
  }
}

let selected: string[] = load()
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

function syncToServer(interests: string[]) {
  void fetch(`${API_URL}/me/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ interests }),
  }).catch(() => {
    /*
     * 同步失敗不影響篩選（那是本機做的），只影響主動推薦。
     * 不重試 —— 下次使用者改動興趣時就會再送一次。
     */
  })
}

export function toggleInterest(id: string) {
  selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
  emit()
  syncToServer(selected)
}

/* 這台裝置的興趣有沒有送上去過。只在本次工作階段記著，重開會再送一次。 */
let synced = false

export function useInterests() {
  const current = useSyncExternalStore(subscribe, () => selected)

  /*
   * 開啟時把本機的興趣推上去一次。
   *
   * 需要它是因為使用者可能在後端還沒有這個功能的時候就選過興趣了 ——
   * 那些選擇只在 localStorage，後端不知道，主動推薦就永遠不會發生。
   */
  useEffect(() => {
    if (synced || current.length === 0) return
    synced = true
    syncToServer(current)
  }, [current])

  return {
    selected: current,
    /** 沒選任何標籤 = 不篩選，全部都算符合 */
    matches: (tags: string[]) =>
      current.length === 0 || tags.some((t) => current.includes(t)),
  }
}
