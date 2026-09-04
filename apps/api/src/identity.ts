/*
 * 使用者識別。
 *
 * 這不是身分驗證 —— 前端在第一次啟動時產生一個隨機 id 存在裝置上，
 * 之後每次請求用 X-User-Ref 帶回來。任何人都能偽造它，所以不能拿來
 * 保護任何東西；它唯一的作用是讓不同裝置的通勤路線不會互相覆蓋
 * （在這之前所有人共用同一個 'dev-user'）。
 *
 * 接上真正的登入之後，改成從驗證過的 token 取出使用者 id，
 * 並把 provider 換成該登入方式，其餘呼叫端不用改。
 */

/** 沒帶或帶了不合格式的 id 時用這個 —— 維持舊行為，不讓請求直接失敗 */
export const FALLBACK_USER_REF = 'dev-user'

/** external_user_refs.provider 的值，用來區隔不同來源的 id */
export const USER_REF_PROVIDER = 'device'

/* 只收 uuid 那種字元集，長度也設上限，避免把任意字串寫進資料庫 */
const VALID_REF = /^[A-Za-z0-9_-]{8,64}$/

export function readUserRef(header: string | null | undefined): string {
  const value = header?.trim()
  return value && VALID_REF.test(value) ? value : FALLBACK_USER_REF
}
