import {
  findMetroStation,
  getLineTransfers,
  getS2STravelTime,
  getStationsOfLine,
  hasTdxCredentials,
  listMetroLines,
} from './tdx.ts'

/*
 * 捷運路徑規劃。
 *
 * 為什麼自己算而不是接外部規劃服務：台北捷運的路網是**靜態資料**。
 * 站序（StationOfLine）與站間運行時間（S2STravelTime）撈一次快取一天，
 * 之後每一次規劃都是純本地計算 —— 對「每分鐘只有 5 次」的 TDX 額度來說，
 * 這是能不能做這個功能的分水嶺。查詢再多也不會多打一次 TDX。
 *
 * 誠實範圍（很重要，不要在畫面上超譯）：
 *   RunTime、StopTime  真實數據（TDX S2STravelTime）
 *   轉乘步行時間        真實數據（TDX LineTransfer 的 TransferTime）
 *   轉乘等車時間        估計值，見 TRANSFER_WAIT_SECONDS
 *   等第一班車的時間     完全沒有算進去
 * 所以結果一律是「約」幾分鐘，不是保證的旅行時間。
 */

/*
 * 轉乘後等下一班車的秒數。
 *
 * TDX 的 TransferTime 只含站內步行，不含等車。台北捷運尖峰班距約 2-4 分鐘，
 * 平均等待取一半，抓 2 分鐘。這是整個計算裡**唯一**的估計值，其餘都是實際數據。
 *
 * 它同時也是演算法的轉乘懲罰：給太低會算出為了省幾十秒而多轉一次的荒謬路線。
 */
const TRANSFER_WAIT_SECONDS = 120

export type RouteLeg = {
  /** 路線名，例如「板南線」 */
  line: string
  lineId: string
  from: string
  to: string
  /** 這一段搭幾站 */
  stops: number
  minutes: number
}

export type RoutePlan = {
  from: string
  to: string
  /** 總時間（分鐘，四捨五入）。含估計的轉乘時間，不含等第一班車。 */
  totalMinutes: number
  transfers: number
  legs: RouteLeg[]
}

/* 節點 = 「某一條線上的某一站」。把轉乘顯性化成一條有成本的邊。 */
type NodeId = string
const nodeId = (lineId: string, stationId: string): NodeId => `${lineId}|${stationId}`
const parseNode = (id: NodeId) => {
  const [lineId, stationId] = id.split('|')
  return { lineId, stationId }
}

type Edge = { to: NodeId; seconds: number; transfer: boolean }

type Graph = {
  edges: Map<NodeId, Edge[]>
  /** 站 id → 這一站在哪幾條線上 */
  nodesByStation: Map<string, NodeId[]>
  /*
   * 站名 → 所有節點。起訖點要用這個而不是 nodesByStation：
   * 「台北車站」同時是 BL12 與 R10，兩個都該當成可能的出發月台。
   */
  nodesByName: Map<string, NodeId[]>
  stationName: Map<string, string>
  lineName: Map<string, string>
}

let graphCache: { at: number; graph: Graph } | null = null
/* 跟 tdx.ts 的靜態資料 TTL 一致 */
const GRAPH_TTL_MS = 24 * 60 * 60 * 1000

function addEdge(edges: Map<NodeId, Edge[]>, from: NodeId, to: NodeId, seconds: number, transfer: boolean) {
  const list = edges.get(from)
  if (!list) {
    edges.set(from, [{ to, seconds, transfer }])
    return
  }
  /* 同一組站對可能出現在多條路線資料裡（區間車、支線），取最短的那筆 */
  const existing = list.find((e) => e.to === to)
  if (!existing) list.push({ to, seconds, transfer })
  else if (seconds < existing.seconds) existing.seconds = seconds
}

async function buildGraph(): Promise<Graph> {
  const [stationOfLine, travelTimes, transfers, lines] = await Promise.all([
    getStationsOfLine(),
    getS2STravelTime(),
    getLineTransfers(),
    /* 路線名要另外查，StationOfLine 只有 LineID */
    listMetroLines(),
  ])

  const edges = new Map<NodeId, Edge[]>()
  const nodesByStation = new Map<string, NodeId[]>()
  const nodesByName = new Map<string, NodeId[]>()
  const stationName = new Map<string, string>()
  const lineName = new Map(lines.map((l) => [l.lineId, l.name]))

  for (const group of stationOfLine) {
    for (const s of group.Stations) {
      stationName.set(s.StationID, s.StationName.Zh_tw)
      const id = nodeId(group.LineID, s.StationID)
      const list = nodesByStation.get(s.StationID)
      if (list) {
        if (!list.includes(id)) list.push(id)
      } else {
        nodesByStation.set(s.StationID, [id])
      }

      const name = s.StationName.Zh_tw
      const byName = nodesByName.get(name)
      if (byName) {
        if (!byName.includes(id)) byName.push(id)
      } else {
        nodesByName.set(name, [id])
      }
    }
  }

  /* 同線相鄰站：權重是真實的行駛 + 停靠秒數，雙向都加 */
  for (const route of travelTimes) {
    for (const t of route.TravelTimes) {
      const seconds = t.RunTime + t.StopTime
      const a = nodeId(route.LineID, t.FromStationID)
      const b = nodeId(route.LineID, t.ToStationID)
      /* 只連兩端都真的在站表裡的邊，避免資料不一致時連出幽靈節點 */
      if (!nodesByStation.has(t.FromStationID) || !nodesByStation.has(t.ToStationID)) continue
      addEdge(edges, a, b, seconds, false)
      addEdge(edges, b, a, seconds, false)
    }
  }

  /*
   * 轉乘邊。一定要用 LineTransfer 這份對照表 ——
   * 同一個實體車站在不同線上的 StationID 是不一樣的（西門 BL11 / G12），
   * 靠「站 id 相同」永遠連不起來，所有需要轉乘的路線都會算不出來（踩過）。
   */
  for (const t of transfers) {
    /* LineTransfer 含環狀線（Y）等非本營運商的路線，站表裡沒有就跳過 */
    if (!nodesByStation.has(t.FromStationID) || !nodesByStation.has(t.ToStationID)) continue

    const seconds = t.TransferTime * 60 + TRANSFER_WAIT_SECONDS
    const a = nodeId(t.FromLineID, t.FromStationID)
    const b = nodeId(t.ToLineID, t.ToStationID)
    addEdge(edges, a, b, seconds, true)
    addEdge(edges, b, a, seconds, true)
  }

  return { edges, nodesByStation, nodesByName, stationName, lineName }
}

async function graph(): Promise<Graph> {
  if (graphCache && Date.now() - graphCache.at < GRAPH_TTL_MS) return graphCache.graph
  const built = await buildGraph()
  graphCache = { at: Date.now(), graph: built }
  return built
}

/*
 * Dijkstra。節點只有一百多個，用線性搜尋找最小值就夠了 ——
 * 為了這個規模導入一個二元堆積不划算。
 */
function shortestPath(g: Graph, starts: NodeId[], goals: Set<NodeId>): NodeId[] | null {
  const dist = new Map<NodeId, number>()
  const prev = new Map<NodeId, NodeId>()
  const visited = new Set<NodeId>()

  for (const s of starts) dist.set(s, 0)

  for (;;) {
    let current: NodeId | null = null
    let best = Infinity
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) {
        best = d
        current = node
      }
    }
    if (current === null) return null
    if (goals.has(current)) {
      const path = [current]
      let node = current
      while (prev.has(node)) {
        node = prev.get(node)!
        path.unshift(node)
      }
      return path
    }

    visited.add(current)
    for (const edge of g.edges.get(current) ?? []) {
      if (visited.has(edge.to)) continue
      const next = best + edge.seconds
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next)
        prev.set(edge.to, current)
      }
    }
  }
}

/** 把節點路徑收合成「搭幾段車」，轉乘邊就是段落的分界 */
function toLegs(g: Graph, path: NodeId[]): { legs: RouteLeg[]; totalSeconds: number } {
  const legs: RouteLeg[] = []
  let totalSeconds = 0

  let legStart = parseNode(path[0])
  let legSeconds = 0
  let stops = 0

  for (let i = 1; i < path.length; i++) {
    const from = parseNode(path[i - 1])
    const to = parseNode(path[i])
    const edge = (g.edges.get(path[i - 1]) ?? []).find((e) => e.to === path[i])
    if (!edge) continue

    totalSeconds += edge.seconds

    if (edge.transfer) {
      /* 換線：把前一段結算掉 */
      if (stops > 0) {
        legs.push({
          line: g.lineName.get(legStart.lineId) ?? legStart.lineId,
          lineId: legStart.lineId,
          from: g.stationName.get(legStart.stationId) ?? legStart.stationId,
          to: g.stationName.get(from.stationId) ?? from.stationId,
          stops,
          minutes: Math.round(legSeconds / 60),
        })
      }
      legStart = to
      legSeconds = 0
      stops = 0
    } else {
      legSeconds += edge.seconds
      stops += 1
    }
  }

  if (stops > 0) {
    const last = parseNode(path[path.length - 1])
    legs.push({
      line: g.lineName.get(legStart.lineId) ?? legStart.lineId,
      lineId: legStart.lineId,
      from: g.stationName.get(legStart.stationId) ?? legStart.stationId,
      to: g.stationName.get(last.stationId) ?? last.stationId,
      stops,
      minutes: Math.round(legSeconds / 60),
    })
  }

  return { legs, totalSeconds }
}

/**
 * 規劃兩站之間的捷運路線。
 * 查不到任何一站、或兩站之間不連通時回 null —— 呼叫端要照實說查不到，不要編。
 */
export async function planMetroRoute(
  origin: string,
  destination: string,
): Promise<RoutePlan | null> {
  if (!hasTdxCredentials()) return null

  const [from, to] = await Promise.all([
    findMetroStation(origin),
    findMetroStation(destination),
  ])
  if (!from || !to) return null
  if (from.name === to.name) return null

  const g = await graph()
  /* 用站名而不是站 id：轉乘站在不同線上是不同的 id，兩邊都要算成候選月台 */
  const starts = g.nodesByName.get(from.name)
  const goals = g.nodesByName.get(to.name)
  if (!starts?.length || !goals?.length) return null

  const path = shortestPath(g, starts, new Set(goals))
  if (!path) return null

  const { legs, totalSeconds } = toLegs(g, path)
  if (legs.length === 0) return null

  return {
    from: from.name,
    to: to.name,
    totalMinutes: Math.round(totalSeconds / 60),
    transfers: legs.length - 1,
    legs,
  }
}
