import { useSyncExternalStore } from 'react'

/*
 * 會員資料。
 *
 * 後端目前沒有身分驗證（tools.ts 一律記為 DEV_USER_REF），
 * 所以這裡先是純前端的 store：沒註冊就是 null，畫面顯示「陌生人」＋預設頭像。
 * 之後接上登入流程時，登入成功呼叫 setMember()、登出呼叫 clearMember() 即可，
 * 畫面不用改。
 */

export type Member = {
  name: string
  /** 會員自己的頭貼網址；沒有就用 DEFAULT_AVATAR */
  avatarUrl: string | null
}

const STORAGE_KEY = 'yoxi.member'

/** 還沒註冊時的稱呼 */
export const GUEST_NAME = '陌生人'

/** 沒有頭貼時的預設頭像，放在 public/images 下 */
export const DEFAULT_AVATAR = '/images/boy.png'

function load(): Member | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { name, avatarUrl } = parsed as Partial<Member>
    if (typeof name !== 'string' || !name.trim()) return null
    return { name, avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null }
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return null
  }
}

let member: Member | null = load()
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

export function setMember(next: Member) {
  member = { name: next.name, avatarUrl: next.avatarUrl ?? null }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(member))
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
  emit()
}

export function clearMember() {
  member = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 同上 */
  }
  emit()
}

export function useMember() {
  const current = useSyncExternalStore(subscribe, () => member)
  return {
    member: current,
    registered: current !== null,
    displayName: current?.name.trim() || GUEST_NAME,
    avatarUrl: current?.avatarUrl || DEFAULT_AVATAR,
  }
}
