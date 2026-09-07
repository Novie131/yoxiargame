/* 日期時間格式化。以台灣的慣用寫法為準。 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

/** 2026-09-02 → 「9 月 2 日・星期三」 */
export function formatDateWithWeekday(date: Date = new Date()): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month} 月 ${day} 日・星期${WEEKDAYS[date.getDay()]}`
}

/** 依時段回傳問候語，對應設計稿的「早安 / 午安 / 晚安」 */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午安'
  return '晚安'
}

/*
 * 現在起 N 分鐘後是幾點。
 *
 * 明確指定臺北時區而不是用裝置的本地時間：這個時間指的是「捷運幾點到站」，
 * 那是臺北的時間。使用者人在國外規劃臺北的行程時，本地時間會是錯的。
 * （greeting() 用本地時間是對的 —— 「早安」該對應他所在地的早上。）
 */
export function timeAfterMinutes(minutes: number, from: Date = new Date()): string {
  const at = new Date(from.getTime() + minutes * 60_000)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at)
}
