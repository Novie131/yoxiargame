import { useState } from 'react'

import { ClipboardIcon } from './icons'

/*
 * 對應設計稿 frame：工作區/task-ui-container
 *
 * 圓形浮動鈕 + 可展開的任務進度面板。
 * 設計稿上面板畫在按鈕下方，但實際位置在畫面底部，往下展開會超出螢幕，
 * 所以改成往上展開。
 */

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
  const percent = Math.round((task.done / task.total) * 100)

  return (
    <div className="pointer-events-none sticky bottom-4 z-10 flex flex-col items-end gap-2.5 px-4">
      {open && (
        <div className="pointer-events-auto w-full rounded-2xl bg-surface p-4 shadow-[0_4px_20px_rgba(22,32,55,.16)]">
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
        type="button"
        aria-label="任務進度"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto relative mr-1 mt-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.20)] transition-transform active:scale-95"
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
