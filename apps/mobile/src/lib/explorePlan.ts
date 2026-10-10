import { useSyncExternalStore } from 'react'

import { addTrip, useTrips } from './trips'

/*
 * 探索頁的「情境小行程」：附近靈感清單、使用者選了哪幾站、存進行程。
 *
 * 對應設計稿 Figma 536:1672（探索）、536:1791（小行程）、536:1894（行程預覽）。
 *
 * ── 這裡的店家全部是示意 ──
 * 設計稿自己就標了「示意景點」「地址／營業待確認」—— 我們手上沒有書店、咖啡店的
 * 真實資料，所以這份清單是寫死的，畫面上也一律照設計稿標示意，不假裝查過。
 * 等有真的地點資料（POI API 或 missions 表）時，換掉 PLACES 就好，
 * 畫面與「選站 → 存進行程」的流程都不用改。
 *
 * ── 存進行程 ──
 * 沿用 lib/trips 的 addTrip（/trips 頁看得到）。小行程不是捷運路線，
 * 但 PlannedTrip 是唯一的「今天的行程」容器，所以：
 *   fromStation / toStation 放固定的鍵 → 同一天反覆存只會覆蓋同一筆，不會洗版
 *   lines 放主題名與站數 → 行程卡片第二行看得出這是哪個小行程
 *   totalMinutes 放停留總分鐘 → 交通時間待確認，不算進去
 */

export type PlaceKind = 'book' | 'coffee' | 'art' | 'museum' | 'trail' | 'food'

export type Place = {
  id: string
  name: string
  /** 探索清單那行短介紹 */
  blurb: string
  /** 小行程頁那行介紹 */
  detail: string
  /** 「先在書店讀一會兒」裡的那段動作 */
  verb: string
  /** 停留時間摘要裡的短稱：「書店50＋咖啡40」 */
  short: string
  kind: PlaceKind
  categories: Category[]
  indoor: boolean
  stayMinutes: number
}

export const CATEGORIES = ['室內', '步道', '景點', '美食', '咖啡', '博物館'] as const
export type Category = (typeof CATEGORIES)[number]

export const PLACES: Place[] = [
  {
    id: 'bookstore',
    name: '巷間書店',
    blurb: '木質書架，留一段閱讀時光',
    detail: '木質書架與窗邊閱讀，安靜翻本書。',
    verb: '在書店讀一會兒',
    short: '書店',
    kind: 'book',
    categories: ['室內', '景點'],
    indoor: true,
    stayMinutes: 50,
  },
  {
    id: 'cafe',
    name: '附近咖啡店',
    blurb: '窗邊喝杯咖啡，慢慢放鬆',
    detail: '一杯咖啡，為今天留一點空白。',
    verb: '到咖啡店歇腳',
    short: '咖啡',
    kind: 'coffee',
    categories: ['室內', '咖啡', '美食'],
    indoor: true,
    stayMinutes: 40,
  },
  {
    id: 'gallery',
    name: '小型藝文空間',
    blurb: '室內看展，也能換個心情',
    detail: '小小的展覽空間，看完再出發。',
    verb: '去藝文空間看個展',
    short: '看展',
    kind: 'art',
    categories: ['室內', '景點'],
    indoor: true,
    stayMinutes: 40,
  },
  {
    id: 'museum',
    name: '社區小博物館',
    blurb: '老物件與在地故事，慢慢逛',
    detail: '老物件與在地故事，室內慢慢逛。',
    verb: '逛逛社區小博物館',
    short: '博物館',
    kind: 'museum',
    categories: ['室內', '博物館', '景點'],
    indoor: true,
    stayMinutes: 60,
  },
  {
    id: 'riverside',
    name: '河濱步道',
    blurb: '雨停之後散散步，看看河景',
    detail: '雨停之後散散步，看看河景。',
    verb: '到河濱散散步',
    short: '散步',
    kind: 'trail',
    categories: ['步道', '景點'],
    indoor: false,
    stayMinutes: 45,
  },
  {
    id: 'snack',
    name: '巷口小吃',
    blurb: '一碗熱湯，暖暖身子',
    detail: '一碗熱湯，暖暖身子再走。',
    verb: '吃碗熱湯暖暖身子',
    short: '小吃',
    kind: 'food',
    categories: ['美食'],
    indoor: true,
    stayMinutes: 30,
  },
]

const byId = (id: string) => PLACES.find((p) => p.id === id)

/* 情境主題。目前只有一個；「更多主題」交給對話，不在這裡假裝還有別的 */
export const THEME = {
  id: 'rainy-books',
  /** 下雨時才冠上「雨天」，沒下雨還寫雨天會被一眼看穿 */
  title: (rainy: boolean) => `${rainy ? '雨天' : ''}書店與咖啡小旅行`,
  tags: ['2小時', '室內放鬆', '少走路'],
  targetMinutes: 120,
  defaultStops: ['bookstore', 'cafe'],
}

/* ── 選了哪幾站 ── */

const KEY = 'yoxi.explore.plan'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return THEME.defaultStops
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return THEME.defaultStops
    const ids = parsed.filter((id): id is string => typeof id === 'string' && !!byId(id))
    return ids.length > 0 ? ids : THEME.defaultStops
  } catch {
    return THEME.defaultStops
  }
}

let stopIds: string[] = read()
const listeners = new Set<() => void>()

function setStops(next: string[]) {
  stopIds = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 存不進去就只有這次有效 */
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/* ── 存進行程 ── */

const PLAN_TRIP_STATION = 'explore-plan'

/** 這筆行程是探索頁存進來的小行程（不是捷運路線，起訖是示意店名） */
export function isExplorePlanTrip(trip: { fromStation: string }): boolean {
  return trip.fromStation === PLAN_TRIP_STATION
}

function saveToTrips(ids: string[], rainy: boolean) {
  const stops = ids.map(byId).filter((p): p is Place => !!p)
  if (stops.length === 0) return
  addTrip({
    /* 只有一站時，行程卡寫「目前位置 → 那一站」 */
    from: stops.length > 1 ? stops[0].name : '目前位置',
    to: stops[stops.length - 1].name,
    fromStation: PLAN_TRIP_STATION,
    toStation: THEME.id,
    /* 起訖已經寫在卡片標題，這一行只講它是哪個主題、幾站 */
    lines: [`${THEME.title(rainy)}・${stops.length} 站（示意）`],
    transfers: 0,
    totalMinutes: stops.reduce((n, s) => n + s.stayMinutes, 0),
  })
}

/*
 * 小行程的狀態與操作。
 *
 * 已經存進今天的行程之後，再加站、拿掉、替換、縮短都會同步覆蓋那一筆 ——
 * 否則行程頁顯示的會是使用者已經改掉的舊版本。
 */
export function usePlan(rainy: boolean) {
  const ids = useSyncExternalStore(subscribe, () => stopIds)
  const trips = useTrips()
  const saved = trips.some(
    (t) => t.fromStation === PLAN_TRIP_STATION && t.toStation === THEME.id,
  )

  const stops = ids.map(byId).filter((p): p is Place => !!p)
  const stayMinutes = stops.reduce((n, s) => n + s.stayMinutes, 0)

  const change = (next: string[], forceSave = false) => {
    setStops(next)
    if (saved || forceSave) saveToTrips(next, rainy)
  }

  return {
    stops,
    stayMinutes,
    saved,
    /** 第幾站（從 1 起算），沒選就是 0 */
    orderOf: (id: string) => ids.indexOf(id) + 1,
    /** 加進小行程，並存進今天的行程（按鈕寫的就是「加入行程」） */
    add: (id: string) => {
      if (ids.includes(id)) return
      change([...ids, id], true)
    },
    /** 至少留一站，空的小行程沒有意義 */
    remove: (id: string) => {
      if (ids.length <= 1) return
      change(ids.filter((x) => x !== id))
    },
    /** 換成下一個還沒選的地點，優先室內 */
    replace: (id: string) => {
      const start = PLACES.findIndex((p) => p.id === id)
      const rest = [...PLACES.slice(start + 1), ...PLACES.slice(0, start)].filter(
        (p) => !ids.includes(p.id),
      )
      const next = rest.find((p) => p.indoor) ?? rest[0]
      if (!next) return
      change(ids.map((x) => (x === id ? next.id : x)))
    },
    canShorten: ids.length > 1,
    /** 拿掉最後一站 */
    shorten: () => {
      if (ids.length <= 1) return
      change(ids.slice(0, -1))
    },
    save: () => saveToTrips(ids, rainy),
  }
}
