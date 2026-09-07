/*
 * 臺北時間。
 *
 * 這是給臺灣使用者的服務，所有「現在幾點」的判斷都要用臺北時區，
 * 不能跟著伺服器所在時區跑 —— Workers 跑在哪個機房是不確定的，
 * Render 的預設時區是 UTC，兩邊算出來的「今天星期幾」會差一天。
 */

export const TIMEZONE = 'Asia/Taipei'

export type TaipeiNow = {
  /** mon…sun */
  day: string
  /** HH:MM，24 小時制 */
  time: string
  /** 週六、週日。國定假日判斷不了（沒有假日行事曆來源），見下方註解。 */
  weekend: boolean
}

/*
 * 注意：weekend 只看星期幾。
 *
 * TDX 的 ServiceDay 另外有 NationalHolidays 旗標，但我們沒有臺灣的國定假日
 * 行事曆，所以補假的週一會被當成平日。班距因此可能低估幾分鐘 ——
 * 這個誤差可以接受，但不要在畫面上把它講成準確值。
 */
export function taipeiNow(at: Date = new Date()): TaipeiNow {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = get('weekday').toLowerCase()

  return {
    day,
    time: `${get('hour')}:${get('minute')}`,
    weekend: day === 'sat' || day === 'sun',
  }
}

/**
 * time 是否落在 [start, end] 之內。
 * start > end 代表跨午夜（22:00–02:00），這時候是「兩段的聯集」而不是空集合。
 */
export function withinWindow(time: string, start: string, end: string): boolean {
  return start <= end ? time >= start && time <= end : time >= start || time <= end
}

/**
 * 「HH:MM」→ 當天的第幾分鐘。
 *
 * TDX 會用 24:00 表示「當天結束」，Date 解析不了那種寫法，所以自己算。
 * 跨午夜的比較一律轉成分鐘數再處理，字串比大小會在 00:30 < 23:00 這裡出錯。
 */
export function toMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours > 30 || minutes > 59) return null
  return hours * 60 + minutes
}
