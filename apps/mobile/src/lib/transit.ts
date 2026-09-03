import { useEffect, useState } from 'react'

import { API_URL } from './api'

/*
 * 捷運即時營運狀態。資料來自後端的 /transit/metro，後端再打 TDX。
 *
 * 兩個限制決定了這裡的寫法：
 *   TDX 額度只有每分鐘 5 次，所以前端也要自己擋重複請求，
 *   而且 TDX 的捷運資料沒有誤點分鐘數，只有事件通報 —— 畫面不要承諾「誤點 N 分」。
 *
 * 失敗時不擋畫面。這是輔助資訊，拿不到就不顯示，
 * 不要讓通勤畫面因為外部服務掛掉而整頁壞掉。
 */

export type MetroIncident = {
  title: string
  description: string
  updatedAt: string
}

export type MetroStatus = {
  line: string
  lineId: string
  status: 'normal' | 'alert'
  delayMinutes: null
  incidents: MetroIncident[]
  arrivingNow: Array<{ station: string; heading: string }>
  note: string
  observedAt: string
}

export type MetroState =
  | { status: 'loading' }
  | { status: 'ready'; metro: MetroStatus }
  | { status: 'error'; message: string }

/* 跟後端的 Cache-Control 對齊 */
const TTL_MS = 30 * 1000

type Snapshot = { at: number; metro: MetroStatus }

const snapshots = new Map<string, Snapshot>()
const inflight = new Map<string, Promise<Snapshot>>()

function fresh(s: Snapshot | undefined): s is Snapshot {
  return s !== undefined && Date.now() - s.at < TTL_MS
}

async function load(line: string): Promise<Snapshot> {
  const res = await fetch(`${API_URL}/transit/metro?line=${encodeURIComponent(line)}`)
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }
  return { at: Date.now(), metro: (await res.json()) as MetroStatus }
}

/* 同一條路線同時被多個元件要時，只實際打一次 */
function get(line: string): Promise<Snapshot> {
  const cached = snapshots.get(line)
  if (fresh(cached)) return Promise.resolve(cached)

  const running = inflight.get(line)
  if (running) return running

  const task = load(line)
    .then((s) => {
      snapshots.set(line, s)
      return s
    })
    .finally(() => {
      inflight.delete(line)
    })

  inflight.set(line, task)
  return task
}

function initialState(line: string): MetroState {
  const cached = snapshots.get(line)
  return fresh(cached) ? { status: 'ready', metro: cached.metro } : { status: 'loading' }
}

export function useMetroStatus(line: string): MetroState {
  const [state, setState] = useState<MetroState>(() => initialState(line))

  /*
   * line 換了就在 render 當下重設，不要等 effect —— 等 effect 的話中間那一幀
   * 會拿上一條路線的資料配新的路線名，顯示成錯的東西。
   * 這是 React 官方的「render 期間調整 state」寫法，不是副作用。
   */
  const [renderedLine, setRenderedLine] = useState(line)
  if (renderedLine !== line) {
    setRenderedLine(line)
    setState(initialState(line))
  }

  useEffect(() => {
    let alive = true
    get(line)
      .then((s) => {
        if (alive) setState({ status: 'ready', metro: s.metro })
      })
      .catch((e: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : '交通資料暫時無法取得',
          })
        }
      })

    return () => {
      alive = false
    }
  }, [line])

  return state
}
