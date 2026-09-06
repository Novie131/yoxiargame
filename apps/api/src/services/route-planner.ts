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
 * 為什麼自己算而不是接外部規劃服務：臺北捷運的路網是**靜態資料**。
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
 * 演算法選擇：Yen's K-Shortest Loopless Paths（外層）+ Dijkstra（核心）。
 *
 * 為什麼不是 A*：A* 是**單一**最短路徑演算法（帶啟發式的 Dijkstra），跑完
 * 只回一條，給不了「除了最佳路線還有哪些選擇」。多路徑的標準解就是 Yen，
 * 而 Yen 的內層本來就是反覆呼叫一個最短路徑核心。
 *
 * 核心用 Dijkstra 而不是 A*，是因為這張圖只有約三百個節點（站 × 線）——
 * A* 的剪枝在這個規模省不到可以測量的時間，卻要多維護一份站座標與
 * 「直線距離 ÷ 最高車速」的啟發式，還得證明它 admissible 才不會算錯。
 *
 * 之後若把公車路網併進來（節點數上萬），只要把 dijkstra() 換成 A*，
 * Yen 的部分一行都不用動 —— 這是刻意留的接縫。
 */

/*
 * 轉乘後等下一班車的秒數。
 *
 * TDX 的 TransferTime 只含站內步行，不含等車。臺北捷運尖峰班距約 2-4 分鐘，
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

/**
 * 一組起訖的規劃結果：最佳路線，加上值得讓使用者自己選的備選。
 *
 * 備選存在的理由不是「湊數字」，是**最快不一定最好**：少轉一次車、
 * 不用在臺北車站走那條長廊，很多人願意為此多花五分鐘。所以備選一律
 * 附上轉乘次數，由使用者自己判斷，我們不替他決定。
 */
export type RouteAlternatives = {
  from: string
  to: string
  best: RoutePlan
  /** 已去重、已濾掉繞遠路的；可能是空陣列（真的只有一條合理路線） */
  alternatives: RoutePlan[]
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
   * 「台北車站」（TDX 站表的寫法）同時是 BL12 與 R10，兩個都該當成可能的出發月台。
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
  /* 圖換了，之前算出來的路線就不算數了 */
  planCache.clear()
  return built
}

/* ── 最短路徑核心 ───────────────────────────────────────────── */

const VIRTUAL_SOURCE: NodeId = '__src'
const VIRTUAL_SINK: NodeId = '__dst'

const edgeKey = (from: NodeId, to: NodeId) => `${from}>${to}`

type Path = { nodes: NodeId[]; seconds: number }

/** 查某個節點出去的邊。虛擬起訖點的邊疊在真實圖上，不去動快取的圖。 */
type EdgeLookup = (node: NodeId) => Edge[]

/*
 * 虛擬起訖點。
 *
 * 「台北車站」在圖上是兩個節點（BL12 與 R10），兩個都該當成可能的出發月台。
 * 多起點的 Dijkstra 很好寫，但 **Yen 需要路徑的第一個節點是固定的** ——
 * 否則從第 0 個節點分岔時，永遠探索不到「從另一個月台出發」的那些路線，
 * 而那常常正是最有價值的備選（少轉一次車的那條）。
 *
 * 加一個 0 成本的虛擬起點與終點，就把多起訖變回單起訖問題，
 * 演算法本身不用為此開任何特例。
 */
function withVirtualEnds(g: Graph, starts: NodeId[], goals: NodeId[]): EdgeLookup {
  const extra = new Map<NodeId, Edge[]>()
  extra.set(
    VIRTUAL_SOURCE,
    starts.map((to) => ({ to, seconds: 0, transfer: false })),
  )
  for (const goal of goals) {
    extra.set(goal, [{ to: VIRTUAL_SINK, seconds: 0, transfer: false }])
  }

  return (node) => {
    const real = g.edges.get(node) ?? []
    const virtual = extra.get(node)
    return virtual ? [...real, ...virtual] : real
  }
}

/*
 * Dijkstra。節點只有幾百個，用線性搜尋找最小值就夠了 ——
 * 為了這個規模導入一個二元堆積不划算，即使 Yen 會反覆呼叫它幾十次
 * （實測整趟規劃在個位數毫秒）。
 *
 * bannedNodes / bannedEdges 是 Yen 用的：把已經走過的分支封起來，
 * 逼演算法找出「不一樣的」下一條路。
 */
function dijkstra(
  edgesOf: EdgeLookup,
  source: NodeId,
  sink: NodeId,
  bannedNodes: Set<NodeId>,
  bannedEdges: Set<string>,
): Path | null {
  const dist = new Map<NodeId, number>([[source, 0]])
  const prev = new Map<NodeId, NodeId>()
  const visited = new Set<NodeId>()

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

    if (current === sink) {
      const nodes = [current]
      let node = current
      while (prev.has(node)) {
        node = prev.get(node)!
        nodes.unshift(node)
      }
      return { nodes, seconds: best }
    }

    visited.add(current)
    for (const edge of edgesOf(current)) {
      if (visited.has(edge.to) || bannedNodes.has(edge.to)) continue
      if (bannedEdges.has(edgeKey(current, edge.to))) continue
      const next = best + edge.seconds
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next)
        prev.set(edge.to, current)
      }
    }
  }
}

function pathSeconds(edgesOf: EdgeLookup, nodes: NodeId[]): number {
  let total = 0
  for (let i = 1; i < nodes.length; i++) {
    const edge = edgesOf(nodes[i - 1]).find((e) => e.to === nodes[i])
    /* 邊被封掉或圖不一致時走不到這裡，但真的發生就當這條路不可用 */
    if (!edge) return Infinity
    total += edge.seconds
  }
  return total
}

const samePrefix = (path: NodeId[], prefix: NodeId[]) =>
  path.length >= prefix.length && prefix.every((n, i) => path[i] === n)

/*
 * Yen's K-Shortest Loopless Paths。
 *
 * 作法：拿上一條已接受的路線，逐一把它的每個節點當「分岔點」，
 * 封掉「會走出同一條路」的那條邊，再從分岔點重算到終點。
 * 所有候選裡最短的那條就是下一條最佳路線，重複 K 次。
 *
 * 封鎖根路徑上的節點是為了避免繞出帶環的路徑（loopless 的來源）。
 */
function yenKShortest(g: Graph, starts: NodeId[], goals: NodeId[], k: number): Path[] {
  const edgesOf = withVirtualEnds(g, starts, goals)

  const first = dijkstra(edgesOf, VIRTUAL_SOURCE, VIRTUAL_SINK, new Set(), new Set())
  if (!first) return []

  const accepted: Path[] = [first]
  /* Yen 的候選集 B。數量是個位數，用陣列 + 每輪線性取最小就夠。 */
  const candidates: Path[] = []
  const seen = new Set<string>([first.nodes.join('>')])

  while (accepted.length < k) {
    const previous = accepted[accepted.length - 1]

    /* 最後一個節點是虛擬終點，從它分岔沒有意義 */
    for (let i = 0; i < previous.nodes.length - 1; i++) {
      const spur = previous.nodes[i]
      const root = previous.nodes.slice(0, i + 1)

      /* 已接受的路線裡，凡是共用這段開頭的，都把它的下一步封起來 */
      const bannedEdges = new Set<string>()
      for (const p of accepted) {
        if (p.nodes.length > i + 1 && samePrefix(p.nodes, root)) {
          bannedEdges.add(edgeKey(p.nodes[i], p.nodes[i + 1]))
        }
      }

      /* 根路徑上的節點（分岔點自己除外）不能再踩，否則會繞回去成環 */
      const bannedNodes = new Set(root.slice(0, -1))

      const spurPath = dijkstra(edgesOf, spur, VIRTUAL_SINK, bannedNodes, bannedEdges)
      if (!spurPath) continue

      const nodes = [...root.slice(0, -1), ...spurPath.nodes]
      const signature = nodes.join('>')
      if (seen.has(signature)) continue

      const rootSeconds = pathSeconds(edgesOf, root)
      if (!Number.isFinite(rootSeconds)) continue

      seen.add(signature)
      candidates.push({ nodes, seconds: rootSeconds + spurPath.seconds })
    }

    if (candidates.length === 0) break

    let bestIndex = 0
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].seconds < candidates[bestIndex].seconds) bestIndex = i
    }
    accepted.push(candidates.splice(bestIndex, 1)[0])
  }

  return accepted
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

/* ── 對外 API ──────────────────────────────────────────────── */

/*
 * 原始搜尋條數。要比最後想留的多，因為換月台造成的「同一條路線」
 * 會在去重時被丟掉 —— 只搜 3 條的話很可能去重完只剩 1 條。
 */
const RAW_PATH_SEARCH = 8

/** 最後最多回幾條備選（不含最佳路線） */
const MAX_ALTERNATIVES = 2

/*
 * 備選可以慢多少才還算是「另一個選擇」。
 *
 * 兩個上限取比較嚴的那個：短程用比例（10 分鐘的路，14 分鐘還能接受），
 * 長程用絕對值（40 分鐘的路，慢 12 分鐘就是繞遠路，不是選擇）。
 * 沒有這道關卡的話，Yen 會很開心地回一條多繞三站的路線，
 * 而使用者要多讀一整張卡片才能忽略它。
 */
const ALTERNATIVE_SLOWER_RATIO = 1.4
const ALTERNATIVE_SLOWER_MINUTES = 12

/*
 * 規劃結果快取。
 *
 * 圖已經快取了，但 Yen 是每次查詢都要重跑的。通勤路線會被反覆查同一組
 * 起訖（首頁、行程頁、通知輪詢各一次），存起來就都省掉了。
 * 圖重建時整個清掉，見 graph()。
 */
const planCache = new Map<string, RouteAlternatives | null>()
const PLAN_CACHE_MAX = 500

/** 同樣的搭法就算是同一條路線 —— 換月台不算不同路線 */
const legSignature = (legs: RouteLeg[]) =>
  legs.map((l) => `${l.lineId}:${l.from}>${l.to}`).join('|')

/**
 * 規劃兩站之間的捷運路線，回傳最佳路線與備選。
 * 查不到任何一站、或兩站之間不連通時回 null —— 呼叫端要照實說查不到，不要編。
 */
export async function planMetroRoutes(
  origin: string,
  destination: string,
): Promise<RouteAlternatives | null> {
  if (!hasTdxCredentials()) return null

  const [from, to] = await Promise.all([
    findMetroStation(origin),
    findMetroStation(destination),
  ])
  if (!from || !to) return null
  if (from.name === to.name) return null

  const cacheKey = `${from.name}→${to.name}`
  const hit = planCache.get(cacheKey)
  if (hit !== undefined) return hit

  const g = await graph()
  /* 用站名而不是站 id：轉乘站在不同線上是不同的 id，兩邊都要算成候選月台 */
  const starts = g.nodesByName.get(from.name)
  const goals = g.nodesByName.get(to.name)
  if (!starts?.length || !goals?.length) return null

  const paths = yenKShortest(g, starts, goals, RAW_PATH_SEARCH)

  const plans: RoutePlan[] = []
  const signatures = new Set<string>()

  for (const path of paths) {
    /* 頭尾是虛擬節點，收合成段落之前要先拿掉 */
    const real = path.nodes.slice(1, -1)
    if (real.length < 2) continue

    const { legs, totalSeconds } = toLegs(g, real)
    if (legs.length === 0) continue

    const signature = legSignature(legs)
    if (signatures.has(signature)) continue
    signatures.add(signature)

    plans.push({
      from: from.name,
      to: to.name,
      totalMinutes: Math.round(totalSeconds / 60),
      transfers: legs.length - 1,
      legs,
    })
  }

  if (plans.length === 0) {
    remember(cacheKey, null)
    return null
  }

  const [best, ...rest] = plans
  const limit = Math.min(
    best.totalMinutes * ALTERNATIVE_SLOWER_RATIO,
    best.totalMinutes + ALTERNATIVE_SLOWER_MINUTES,
  )

  /*
   * 挑出真的值得讓使用者選的備選。
   *
   * Yen 回的路徑是照時間排的，所以每一條備選都比前面的慢。既然慢了，
   * 它至少要在**別的地方**比較好，否則就是一條又慢又要多換一次車的路 ——
   * 那不是選擇，是雜訊（實測「淡水→象山」的第二、三條就是這樣：
   * 比直達慢 8 分鐘，還要多轉兩次）。
   *
   * 判準是 Pareto 支配：轉乘次數不能比已經列出的任何一條還多。
   * 允許持平是刻意的 —— 轉乘次數一樣但走不同線（「西門→大安」可以走
   * 松山新店線也可以走板南線）是真的有人會想選的，尤其某條線出事的時候。
   */
  const alternatives: RoutePlan[] = []
  let fewestTransfers = best.transfers

  for (const plan of rest) {
    if (alternatives.length >= MAX_ALTERNATIVES) break
    if (plan.totalMinutes > limit) continue
    if (plan.transfers > fewestTransfers) continue
    alternatives.push(plan)
    fewestTransfers = Math.min(fewestTransfers, plan.transfers)
  }

  const result: RouteAlternatives = {
    from: best.from,
    to: best.to,
    best,
    alternatives,
  }

  remember(cacheKey, result)
  return result
}

function remember(key: string, value: RouteAlternatives | null) {
  /* 滿了就整個清掉。做 LRU 要多一份順序表，為了幾百筆不值得。 */
  if (planCache.size >= PLAN_CACHE_MAX) planCache.clear()
  planCache.set(key, value)
}

/**
 * 只要最佳路線。給不需要備選的呼叫端（通勤路線推導、行程選項比較）用。
 */
export async function planMetroRoute(
  origin: string,
  destination: string,
): Promise<RoutePlan | null> {
  const result = await planMetroRoutes(origin, destination)
  return result?.best ?? null
}
