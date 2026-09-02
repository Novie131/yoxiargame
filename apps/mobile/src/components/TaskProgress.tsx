import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { ClipboardIcon } from './icons'

/*
 * 對應設計稿 frame：工作區/task-ui-container
 *
 * 圓形浮動鈕 + 可展開的任務進度面板。
 * 設計稿上面板畫在按鈕下方，但實際位置在畫面底部，往下展開會超出螢幕，
 * 所以預設往上展開；只有按鈕被拖到畫面上緣時才改回往下。
 *
 * 浮動鈕可拖曳：位移用 transform 疊在原本 sticky 的位置上，範圍夾在捲動容器內。
 * 面板是滿版寬度的卡片，所以反向抵銷水平位移，只跟著按鈕上下移動。
 */

const EDGE = 8 // 按鈕距離容器邊界的最小留白
const TAP = 4 // 位移小於這個距離仍視為點擊
const PANEL_ROOM = 190 // 按鈕上方不足這個高度就把面板改放到下面

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

type Drag = {
  id: number
  startX: number
  startY: number
  fromX: number
  fromY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  moved: boolean
}

type Task = {
  title: string
  done: number
  total: number
  reward: string
}

const task: Task = {
  title: '完成今日散步推薦',
  done: 2,
  total: 3,
  reward: '完成後可獲得 100 點探索幣',
}

export function TaskProgress({ badge = 3 }: { badge?: number }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [panelBelow, setPanelBelow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<Drag | null>(null)
  const skipClick = useRef(false)
  const percent = Math.round((task.done / task.total) * 100)

  /* 拖曳範圍取捲動容器（手機殼的可視區），拿不到就退回整份文件 */
  const bounds = () =>
    (btnRef.current?.closest('main') ?? document.documentElement).getBoundingClientRect()

  const syncPanelSide = () => {
    const el = btnRef.current
    if (!el) return
    setPanelBelow(el.getBoundingClientRect().top - bounds().top < PANEL_ROOM)
  }

  /* 轉向或視窗縮放後，把按鈕拉回可視範圍內 */
  useEffect(() => {
    const onResize = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const b = bounds()
      setPos((p) => ({
        x: clamp(p.x, p.x + b.left + EDGE - r.left, p.x + b.right - EDGE - r.right),
        y: clamp(p.y, p.y + b.top + EDGE - r.top, p.y + b.bottom - EDGE - r.bottom),
      }))
      syncPanelSide()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = btnRef.current
    if (!el || e.button !== 0) return
    const r = el.getBoundingClientRect()
    const b = bounds()
    skipClick.current = false
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fromX: pos.x,
      fromY: pos.y,
      /* 邊界換算成位移量：現在的位移 + 按鈕還能往該方向移動的距離 */
      minX: pos.x + (b.left + EDGE - r.left),
      maxX: pos.x + (b.right - EDGE - r.right),
      minY: pos.y + (b.top + EDGE - r.top),
      maxY: pos.y + (b.bottom - EDGE - r.bottom),
      moved: false,
    }
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.hypot(dx, dy) < TAP) return
      d.moved = true
      setDragging(true)
    }
    setPos({
      x: clamp(d.fromX + dx, d.minX, d.maxX),
      y: clamp(d.fromY + dy, d.minY, d.maxY),
    })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (btnRef.current?.hasPointerCapture(e.pointerId)) {
      btnRef.current.releasePointerCapture(e.pointerId)
    }
    if (!d.moved) return
    /* 拖過了就不要順便展開面板，click 會在 pointerup 之後補上 */
    skipClick.current = true
    setDragging(false)
    syncPanelSide()
  }

  const onClick = () => {
    if (skipClick.current) {
      skipClick.current = false
      return
    }
    setOpen((v) => !v)
  }

  return (
    <div
      className="pointer-events-none sticky bottom-4 z-10 flex justify-end px-4"
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
    >
      {open && (
        /* 面板脫離流排，按鈕才不會因為面板展開而被推走 */
        <div
          className={[
            'pointer-events-auto absolute inset-x-4 rounded-2xl bg-surface p-4',
            'shadow-[0_4px_20px_rgba(22,32,55,.16)]',
            panelBelow ? 'top-full mt-2.5' : 'bottom-full mb-2.5',
          ].join(' ')}
          style={{ transform: `translateX(${-pos.x}px)` }}
        >
          <div className="flex items-start justify-between">
            <h3 className="text-[17px] font-bold">任務進度</h3>
            <button
              type="button"
              aria-label="關閉任務進度"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 p-1 text-[20px] leading-none text-subtle"
            >
              ✕
            </button>
          </div>

          <div className="mt-2.5 flex items-baseline justify-between">
            <p className="text-[15px] font-bold">{task.title}</p>
            <p className="text-[15px] font-bold text-primary">
              {task.done}/{task.total}
            </p>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-tint"
            role="progressbar"
            aria-valuenow={task.done}
            aria-valuemin={0}
            aria-valuemax={task.total}
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="mt-2 text-[12px] text-subtle">{task.reward}</p>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        aria-label="任務進度，可拖曳移動"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        className={[
          'pointer-events-auto relative mr-1 mt-1 flex h-12 w-12 touch-none items-center justify-center',
          'rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.20)]',
          dragging ? 'cursor-grabbing scale-105' : 'cursor-grab transition-transform active:scale-95',
        ].join(' ')}
      >
        <ClipboardIcon />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>
    </div>
  )
}
