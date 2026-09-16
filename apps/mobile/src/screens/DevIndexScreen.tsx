import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { startDemoRide } from '@/lib/ride'

/*
 * 原型導覽頁 —— 方便 demo 時直接跳到任一畫面。
 * 進度對照 Document/ROADMAP.md，正式版本應移除。
 */

type Item = { to: string; label: string; file: string; needsRide?: boolean }

const groups: Array<{ title: string; items: Item[] }> = [
  {
    title: '首頁 Agent',
    items: [
      { to: '/', label: '活動示意', file: '初步確定方向/agent-home-activity.png' },
      { to: '/interests', label: '興趣調查', file: '初步確定方向/agent-home-interests.png' },
      {
        to: '/commute-setup',
        label: '通勤路線設定',
        file: '初步確定方向/agent-home-commute-setup.png（已改為真實流程，非還原稿）',
      },
    ],
  },
  {
    title: '情境通知',
    items: [
      { to: '/rainy', label: '下雨情境', file: '初步確定方向/rainy-commute-notification.png' },
      { to: '/uv', label: '紫外線警示', file: '初步確定方向/uv-alert-commute-notification.png' },
    ],
  },
  {
    title: '叫車流程',
    items: [
      { to: '/ride/booking', label: '① 選上車點', file: '初步確定方向/yoxi-booking.png' },
      { to: '/ride/estimate', label: '② 預估車資', file: '初步確定方向/yoxi-ride-estimate.png' },
      /*
       * 這兩頁讀的是實際叫的那一趟，直接開會跳回叫車頁。
       * needsRide 會先用真實估價開一趟示範行程再進去。
       */
      {
        to: '/ride/driver',
        label: '③ 司機前往中',
        file: '初步確定方向/yoxi-driver-arriving.png',
        needsRide: true,
      },
      {
        to: '/ride/trip',
        label: '④ 行程進行中',
        file: '初步確定方向/yoxi-trip-in-progress.png',
        needsRide: true,
      },
    ],
  },
  {
    title: '探索',
    items: [
      { to: '/explore', label: '探索首頁', file: '工作區/exploration-home-5.png（未拍板）' },
    ],
  },
  {
    title: '設定與會員（提案版，無設計稿）',
    items: [
      { to: '/settings', label: '設定', file: '無設計稿' },
      { to: '/member', label: '會員', file: '無設計稿' },
    ],
  },
  {
    title: '行程',
    items: [
      { to: '/trips', label: '常用路線', file: '行程-常用路線/trips-frequent-routes.png' },
    ],
  },
]

const total = groups.reduce((n, g) => n + g.items.length, 0)

export function DevIndexScreen() {
  const navigate = useNavigate()
  const [preparing, setPreparing] = useState<string | null>(null)

  /* 先開一趟示範行程再進去，不然那兩頁會判定沒有行程而跳回叫車頁 */
  const openWithRide = async (to: string) => {
    setPreparing(to)
    const ok = await startDemoRide()
    setPreparing(null)
    /* 估價打不通就還是進去 —— 那兩頁會顯示自己的空狀態，比停在這裡好 */
    void ok
    navigate(to)
  }

  return (
    <div className="px-5 py-5">
      <h1 className="text-[20px] font-bold">畫面清單</h1>
      <p className="mt-1 text-[13px] text-subtle">
        設計稿 {total} 張，全部已實作
      </p>

      <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[12px] leading-[1.7] text-muted">
        <p className="font-semibold text-ink">可走的流程</p>
        <p>
          下雨情境 →「立即叫車」→ 預估車資（依公告費率即時估算）→ 確認叫車 →
          司機前往中（倒數自動進入）→ 行程進行中 → 完成
        </p>
        <p className="mt-1.5">
          探索頁任務 →「叫車前往」、對話問車資 → 估價卡 →「叫車前往」、
          通知收件匣 →「改叫計程車」，三個入口都進同一條流程
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 mt-6 text-[13px] font-semibold text-muted">{g.title}</h2>
          <ul className="space-y-2">
            {g.items.map((s) => {
              const body = (
                <>
                  <p className="text-[15px] font-semibold text-primary">
                    {s.label}
                    {preparing === s.to && (
                      <span className="ml-1.5 text-[11px] font-normal">準備示範行程中…</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{s.file}</p>
                </>
              )
              const className =
                'block w-full rounded-xl border border-primary/30 bg-primary-tint px-4 py-3 text-left'

              return (
                <li key={s.to}>
                  {s.needsRide ? (
                    <button
                      type="button"
                      onClick={() => void openWithRide(s.to)}
                      disabled={preparing !== null}
                      className={`${className} disabled:opacity-60`}
                    >
                      {body}
                    </button>
                  ) : (
                    <Link to={s.to} className={className}>
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
