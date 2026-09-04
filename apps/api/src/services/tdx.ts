/*
 * TDX 運輸資料流通服務（交通部）。目前只接台北捷運。
 *
 * 申請：tdx.transportdata.tw → 會員中心 → API 金鑰管理，
 * 取「API金鑰內容」的 Client Id / Client Secret（MQTT 那組用不到）。
 *
 * 兩件事跟其他外部服務不一樣，寫程式時要放在心上：
 *
 * 1. OAuth2 兩段式。先用 client_credentials 換 access token（有效 86400 秒），
 *    之後每次呼叫帶 Bearer。官方明講 token 要快取，不要每次呼叫都重換。
 *
 * 2. 流量極少。實測回應標頭 x-ratelimit-limit-minute: 5 —— 每分鐘只有 5 次，
 *    不是文件上寫的每秒 50 次。所以快取不是最佳化而是必要條件，
 *    而且要擋併發重複請求，否則同時來三個使用者就會打爆額度。
 *    下面的 TTL 已經抓成穩定情況下每分鐘最多 3 次。
 *
 * 實測到的資料限制（2026-09）：
 *   Alert     正常時回傳一筆 AlertID="0"、Title="正常營運" 的哨兵記錄，不是空陣列。
 *   LiveBoard 只有「此刻正在進站」的列車，全線僅個位數筆且 EstimateTime 一律 0。
 *             它不是「下班車還有幾分鐘」的看板，不要拿來做倒數。
 *   兩者都沒有誤點分鐘數，捷運誤點只能從 Alert 的文字判斷。
 */

const AUTH_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
const API_BASE = 'https://tdx.transportdata.tw/api/basic'

/* 台北捷運。之後要加高雄（KRTC）、桃園（TYMetro）時把它變成參數。 */
const OPERATOR = 'TRTC'

const TIMEOUT_MS = 8000

/*
 * TTL。額度是每分鐘 5 次，捷運三支加起來穩定狀態約 3 次，
 * 公車再吃 1-2 次，所以公車事件的 TTL 特別長（事件本來就很少變）。
 */
const ALERT_TTL_MS = 60 * 1000
const LIVEBOARD_TTL_MS = 30 * 1000
const LINE_TTL_MS = 24 * 60 * 60 * 1000
const BUS_ETA_TTL_MS = 30 * 1000
const BUS_ALERT_TTL_MS = 5 * 60 * 1000

/*
 * 硬性配額守門。TTL 只能減少「同一支」API 的重複呼叫，
 * 擋不住「同時查捷運又查三條公車」這種跨端點的疊加。
 * 撞到上限時寧可回過期的快取，也不要讓 TDX 回 429 —— 那會連帶浪費一次額度。
 */
const MAX_CALLS_PER_MINUTE = 5
const callTimes: number[] = []

function budgetAvailable(): boolean {
  const cutoff = Date.now() - 60_000
  while (callTimes.length > 0 && callTimes[0] < cutoff) callTimes.shift()
  return callTimes.length < MAX_CALLS_PER_MINUTE
}

export function hasTdxCredentials(): boolean {
  return Boolean(process.env.TDX_CLIENT_ID && process.env.TDX_CLIENT_SECRET)
}

/* ── token ── */

let token: { value: string; expiresAt: number } | null = null
let tokenInFlight: Promise<string> | null = null

async function getToken(): Promise<string> {
  /* 提早 60 秒換發，避免剛好卡在邊界上用到過期的 token */
  if (token && Date.now() < token.expiresAt - 60_000) return token.value
  if (tokenInFlight) return tokenInFlight

  tokenInFlight = (async () => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.TDX_CLIENT_ID ?? '',
      client_secret: process.env.TDX_CLIENT_SECRET ?? '',
    })

    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`TDX 換發 token 失敗：${res.status}`)

    const json = (await res.json()) as { access_token: string; expires_in: number }
    token = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
    return token.value
  })()

  try {
    return await tokenInFlight
  } finally {
    tokenInFlight = null
  }
}

/* ── 帶快取與併發合流的取用 ── */

type Cached<T> = { at: number; value: T }
const cache = new Map<string, Cached<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

async function get<T>(path: string, ttl: number): Promise<T> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < ttl) return hit.value as T

  /* 同一個路徑同時被要兩次，只實際打一次。每分鐘 5 次的額度禁不起併發。 */
  const running = inFlight.get(path)
  if (running) return running as Promise<T>

  const task = (async () => {
    /* 配額用完時退回過期快取；連快取都沒有才報錯 */
    if (!budgetAvailable()) {
      if (hit) return hit.value as T
      throw new Error('TDX 這一分鐘的額度已用完，請稍後再試')
    }
    callTimes.push(Date.now())

    const accessToken = await getToken()
    const res = await fetch(`${API_BASE}/${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (res.status === 429) {
      /* 超額時寧可用舊資料，也不要讓整個對話失敗 */
      if (hit) return hit.value as T
      const retryAfter = res.headers.get('retry-after') ?? '?'
      throw new Error(`TDX 流量已達上限，${retryAfter} 秒後可再試`)
    }
    if (!res.ok) throw new Error(`TDX ${path} 回應 ${res.status}`)

    const value = (await res.json()) as T
    cache.set(path, { at: Date.now(), value })
    return value
  })()

  inFlight.set(path, task)
  try {
    return await task
  } finally {
    inFlight.delete(path)
  }
}

/* ── 捷運 ── */

type MetroLine = {
  LineID: string
  LineName: { Zh_tw: string; En: string }
}

type MetroAlert = {
  AlertID: string
  Title: string
  Description: string
  Status: number
  Scope?: {
    Lines?: Array<{ LineID?: string; LineName?: string }>
    Stations?: Array<{ StationID?: string; StationName?: string }>
  }
  PublishTime: string
  UpdateTime: string
}

type MetroLiveBoard = {
  LineID: string
  StationID: string
  StationName: { Zh_tw: string }
  TripHeadSign: string
  DestinationStationName: { Zh_tw: string }
  ServiceStatus: number
  EstimateTime: number
  UpdateTime: string
}

function getLines() {
  return get<MetroLine[]>(`v2/Rail/Metro/Line/${OPERATOR}?%24format=JSON`, LINE_TTL_MS)
}

function getAlerts() {
  return get<{ Alerts?: MetroAlert[]; UpdateTime: string }>(
    `v2/Rail/Metro/Alert/${OPERATOR}?%24format=JSON`,
    ALERT_TTL_MS,
  )
}

function getLiveBoard() {
  return get<MetroLiveBoard[]>(
    `v2/Rail/Metro/LiveBoard/${OPERATOR}?%24format=JSON`,
    LIVEBOARD_TTL_MS,
  )
}

/**
 * 使用者說的路線名 → 官方路線。
 * 「板南線」「板南」「BL」都要能對上；對不到時回 null，讓呼叫端照實說查不到。
 */
async function resolveLine(query: string): Promise<MetroLine | null> {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const lines = await getLines()
  return (
    lines.find((l) => l.LineID.toLowerCase() === q) ??
    lines.find((l) => l.LineName.Zh_tw === query.trim()) ??
    lines.find((l) => l.LineName.Zh_tw.replace(/線$/, '') === query.trim().replace(/線$/, '')) ??
    lines.find((l) => l.LineName.En.toLowerCase() === q) ??
    null
  )
}

/* 正常營運時 TDX 會回一筆 AlertID="0" 的哨兵記錄，那不是事件 */
function isRealIncident(a: MetroAlert): boolean {
  return a.AlertID !== '0' && a.Title !== '正常營運'
}

function affectsLine(a: MetroAlert, lineId: string, lineName: string): boolean {
  const lines = a.Scope?.Lines ?? []
  /* 沒有指定範圍的事件視為全網通用，寧可多報也不要漏報 */
  if (lines.length === 0) return true
  return lines.some((l) => l.LineID === lineId || l.LineName === lineName)
}

export type MetroStatus = {
  line: string
  lineId: string
  status: 'normal' | 'alert'
  /** TDX 的捷運資料沒有誤點分鐘數，一律為 null，不要編一個數字出來 */
  delayMinutes: null
  incidents: Array<{ title: string; description: string; updatedAt: string }>
  /** 此刻正在進站的列車，全線通常只有個位數筆 */
  arrivingNow: Array<{ station: string; heading: string }>
  note: string
  observedAt: string
}

export async function getMetroStatus(lineQuery: string): Promise<MetroStatus | null> {
  const line = await resolveLine(lineQuery)
  if (!line) return null

  const name = line.LineName.Zh_tw

  /* 到站快照掛掉不該讓營運狀態一起掛掉 */
  const [alertData, board] = await Promise.all([
    getAlerts(),
    getLiveBoard().catch(() => [] as MetroLiveBoard[]),
  ])

  const incidents = (alertData.Alerts ?? [])
    .filter(isRealIncident)
    .filter((a) => affectsLine(a, line.LineID, name))
    .map((a) => ({
      title: a.Title,
      description: a.Description,
      updatedAt: a.UpdateTime,
    }))

  const arrivingNow = board
    .filter((b) => b.LineID === line.LineID)
    .map((b) => ({
      station: b.StationName.Zh_tw,
      heading: b.TripHeadSign || b.DestinationStationName?.Zh_tw || '',
    }))

  return {
    line: name,
    lineId: line.LineID,
    status: incidents.length > 0 ? 'alert' : 'normal',
    delayMinutes: null,
    incidents,
    arrivingNow,
    note:
      incidents.length > 0
        ? incidents.map((i) => i.title).join('；')
        : '目前無營運事件通報',
    observedAt: alertData.UpdateTime,
  }
}

/* ── 捷運站點 ── */

/*
 * 站點清單用來做兩件事：設定通勤路線時的站名建議，以及由起訖站反推所屬路線。
 *
 * 反推路線是必要的，因為畫面上的即時狀態徽章要有 line 才查得動，
 * 而使用者只會講「板橋到市政府」，不會講「板南線」。
 *
 * StationOfLine 是幾乎不變的靜態資料，TTL 跟路線清單一樣拉到一天，
 * 才不會吃掉每分鐘只有 5 次的額度。
 */

type MetroStationOfLine = {
  LineID: string
  Stations: Array<{
    Sequence: number
    StationID: string
    StationName: { Zh_tw: string; En: string }
  }>
}

function getStationOfLine() {
  return get<MetroStationOfLine[]>(
    `v2/Rail/Metro/StationOfLine/${OPERATOR}?%24format=JSON`,
    LINE_TTL_MS,
  )
}

export type MetroStation = {
  stationId: string
  name: string
  /** 這一站經過的所有路線名。轉乘站會有多條，例如台北車站有淡水信義線與板南線。 */
  lines: string[]
}

/* 「板橋」「板橋站」「 板橋 」要視為同一站 */
function normalizeStationName(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/站$/, '').toLowerCase()
}

/* 依站名彙整的索引。同一站出現在多條路線時合併成一筆，lines 累積。 */
async function stationIndex(): Promise<MetroStation[]> {
  const [lines, stationOfLine] = await Promise.all([getLines(), getStationOfLine()])
  const lineNameById = new Map(lines.map((l) => [l.LineID, l.LineName.Zh_tw]))

  const byId = new Map<string, MetroStation>()
  for (const group of stationOfLine) {
    const lineName = lineNameById.get(group.LineID)
    if (!lineName) continue

    for (const s of group.Stations) {
      const existing = byId.get(s.StationID)
      if (existing) {
        if (!existing.lines.includes(lineName)) existing.lines.push(lineName)
      } else {
        byId.set(s.StationID, {
          stationId: s.StationID,
          name: s.StationName.Zh_tw,
          lines: [lineName],
        })
      }
    }
  }
  return [...byId.values()]
}

/**
 * 站名建議。前綴相符排在包含相符之前，讓打「板」時「板橋」優先於「南港軟體園區」。
 * 空字串回傳空陣列，不要把整份站表倒給前端。
 */
export async function searchMetroStations(query: string, limit = 8): Promise<MetroStation[]> {
  const q = normalizeStationName(query)
  if (!q) return []

  const stations = await stationIndex()
  const prefix: MetroStation[] = []
  const contains: MetroStation[] = []

  for (const s of stations) {
    const name = normalizeStationName(s.name)
    if (name.startsWith(q)) prefix.push(s)
    else if (name.includes(q)) contains.push(s)
  }

  return [...prefix, ...contains].slice(0, limit)
}

/** 站名 → 站點。對不到時回 null（可能是公車站或打錯字）。 */
export async function findMetroStation(name: string): Promise<MetroStation | null> {
  const q = normalizeStationName(name)
  if (!q) return null
  const stations = await stationIndex()
  return stations.find((s) => normalizeStationName(s.name) === q) ?? null
}

export type CommuteLineResolution = {
  /** 查不出來時為 null —— 呼叫端要照實處理，不要塞一條猜的路線 */
  line: string | null
  /** 起訖站沒有共同路線，代表中途要轉乘 */
  transferRequired: boolean
  /*
   * 對得上站表時的正式站名。
   *
   * 需要它是因為同一站會有好幾種寫法：表單送「古亭」，模型送「古亭站」。
   * 不統一的話，用講的跟用填的會存出兩筆看起來不一樣的資料。
   * 對不上時維持呼叫端傳進來的原字串（可能是公車站或打錯字）。
   */
  originName: string
  destinationName: string
}

/**
 * 由起訖站推出這條通勤路線的主要路線名。
 *
 * 兩站有共同路線就用那條；沒有共同路線（要轉乘）時回傳起點所在的第一條，
 * 因為那是使用者實際上車的那條線，即時狀態要盯的也是它。
 */
export async function resolveCommuteLine(
  origin: string,
  destination: string,
): Promise<CommuteLineResolution> {
  const [from, to] = await Promise.all([
    findMetroStation(origin),
    findMetroStation(destination),
  ])

  if (!from || !to) {
    return {
      line: from?.lines[0] ?? null,
      transferRequired: false,
      originName: from?.name ?? origin,
      destinationName: to?.name ?? destination,
    }
  }

  const shared = from.lines.find((l) => to.lines.includes(l))
  return {
    line: shared ?? from.lines[0] ?? null,
    transferRequired: shared === undefined,
    originName: from.name,
    destinationName: to.name,
  }
}

/* ── 公車 ── */

/*
 * 公車跟捷運不同，資料是分縣市的，路線名要搭配城市才查得到。
 * 這是 TDX 的城市代碼，前端傳進來的值一律要對得上這張表。
 */
const BUS_CITIES = [
  'Taipei',
  'NewTaipei',
  'Taoyuan',
  'Taichung',
  'Tainan',
  'Kaohsiung',
  'Keelung',
  'Hsinchu',
  'HsinchuCounty',
] as const

export type BusCity = (typeof BUS_CITIES)[number]

export function isBusCity(value: string): value is BusCity {
  return (BUS_CITIES as readonly string[]).includes(value)
}

type BusArrival = {
  StopUID: string
  StopName: { Zh_tw: string }
  RouteName: { Zh_tw: string }
  Direction: number
  /** 秒。實測 230 這種值，不是分鐘。沒有預估時為 undefined。 */
  EstimateTime?: number
  StopStatus: number
  UpdateTime: string
}

type BusAlert = {
  AlertID: string
  Title: string
  Description: string
  Status: number
  Scope?: { Routes?: Array<{ RouteName?: { Zh_tw?: string } }> }
  StartTime?: string
  EndTime?: string
  UpdateTime: string
}

/* TDX 的 StopStatus 列舉。0 以外都代表這站當下沒有預估時間。 */
function stopStatusText(status: number): string | null {
  switch (status) {
    case 0:
      return null
    case 1:
      return '尚未發車'
    case 2:
      return '交管不停靠'
    case 3:
      return '末班車已過'
    case 4:
      return '今日未營運'
    default:
      return '狀態不明'
  }
}

function directionText(d: number): string {
  return d === 0 ? '去程' : d === 1 ? '返程' : '未知方向'
}

export type BusArrivalInfo = {
  stop: string
  direction: string
  /** 沒有預估時間時為 null，例如尚未發車 */
  etaMinutes: number | null
  status: string | null
}

export type BusStatus = {
  route: string
  city: BusCity
  stops: BusArrivalInfo[]
  incidents: Array<{ title: string; description: string; period: string | null }>
  /** 有指定站名但一站都沒對上時為 true，讓呼叫端能照實說「查不到這站」 */
  stopNotFound: boolean
  note: string
  observedAt: string
}

/* 事件已經結束或還沒開始的不要報，使用者只在意現在 */
function isActiveNow(a: BusAlert): boolean {
  const now = Date.now()
  if (a.StartTime && Date.parse(a.StartTime) > now) return false
  if (a.EndTime && Date.parse(a.EndTime) < now) return false
  return true
}

function periodText(a: BusAlert): string | null {
  if (!a.StartTime && !a.EndTime) return null
  const fmt = (t?: string) => (t ? t.slice(0, 16).replace('T', ' ') : '—')
  return `${fmt(a.StartTime)} ~ ${fmt(a.EndTime)}`
}

/**
 * 公車即時到站。
 *
 * 不帶 stop 時會回整條路線的站牌，數量可能上百筆，所以只取最近的幾站；
 * 使用者真正想問的幾乎都是「我這站還有多久」，帶 stop 才是常態。
 */
export async function getBusStatus(
  city: BusCity,
  routeName: string,
  stopName?: string,
): Promise<BusStatus> {
  const route = routeName.trim()
  const encodedRoute = encodeURIComponent(route)

  const [arrivals, alerts] = await Promise.all([
    get<BusArrival[]>(
      `v2/Bus/EstimatedTimeOfArrival/City/${city}/${encodedRoute}?%24format=JSON`,
      BUS_ETA_TTL_MS,
    ),
    /* 事件查不到不該讓到站時間一起掛掉 */
    get<BusAlert[]>(`v2/Bus/Alert/City/${city}?%24format=JSON`, BUS_ALERT_TTL_MS).catch(
      () => [] as BusAlert[],
    ),
  ])

  const wanted = stopName?.trim()
  const matched = wanted
    ? arrivals.filter((a) => a.StopName.Zh_tw.includes(wanted))
    : arrivals

  /* 有預估時間的排前面，其餘（尚未發車等）排後面 */
  const sorted = [...matched].sort((x, y) => {
    const a = x.EstimateTime ?? Number.POSITIVE_INFINITY
    const b = y.EstimateTime ?? Number.POSITIVE_INFINITY
    return a - b
  })

  const stops: BusArrivalInfo[] = sorted.slice(0, wanted ? 10 : 5).map((a) => ({
    stop: a.StopName.Zh_tw,
    direction: directionText(a.Direction),
    etaMinutes:
      typeof a.EstimateTime === 'number' ? Math.round(a.EstimateTime / 60) : null,
    status: stopStatusText(a.StopStatus),
  }))

  const incidents = alerts
    .filter(isActiveNow)
    .filter((a) => (a.Scope?.Routes ?? []).some((r) => r.RouteName?.Zh_tw === route))
    .map((a) => ({
      title: a.Title,
      description: a.Description,
      period: periodText(a),
    }))

  const stopNotFound = Boolean(wanted) && matched.length === 0

  const note = stopNotFound
    ? `這條路線上找不到含「${wanted}」的站牌`
    : arrivals.length === 0
      ? `查不到「${route}」這條路線的即時資料`
      : incidents.length > 0
        ? incidents.map((i) => i.title).join('；')
        : '目前無事件通報'

  return {
    route,
    city,
    stops,
    incidents,
    stopNotFound,
    note,
    observedAt: arrivals[0]?.UpdateTime ?? new Date().toISOString(),
  }
}
