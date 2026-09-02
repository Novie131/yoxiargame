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
