/*
 * 裝置識別碼。
 *
 * 這不是登入 —— 只是第一次啟動時產生一組隨機 id 存在裝置上，之後每次呼叫後端
 * 都用 X-User-Ref 帶回去。後端拿它當 external_user_refs 的鍵。
 *
 * 之所以需要：在這之前後端把所有人都記成同一個 'dev-user'，等於全世界共用
 * 一條通勤路線。有了它，至少每台裝置有自己的資料。
 * 任何人都能偽造這個值，所以它不能拿來保護任何東西；
 * 接上真正的登入後，改成送驗證過的 token，這個檔案就可以刪掉。
 */

const STORAGE_KEY = 'yoxi.userRef'

function generate(): string {
  /* randomUUID 只在安全來源（https / localhost）可用 */
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  /* 最後退路。撞號的機率不是零，但總比沒有識別碼好 */
  return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/* 後端 identity.ts 的規則，對不上就會被當成沒帶 */
const VALID = /^[A-Za-z0-9_-]{8,64}$/

let cached: string | null = null

export function getUserRef(): string {
  if (cached) return cached

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && VALID.test(stored)) {
      cached = stored
      return cached
    }
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
  }

  cached = generate()
  try {
    localStorage.setItem(STORAGE_KEY, cached)
  } catch {
    /* 存不進去就是每次開啟都換一組，資料留不住，但功能還能走 */
  }
  return cached
}

/** 所有需要識別使用者的請求都帶這組標頭 */
export function userHeaders(): Record<string, string> {
  return { 'X-User-Ref': getUserRef() }
}
