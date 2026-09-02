import { Link } from 'react-router'

/*
 * 原型導覽頁 —— 方便 demo 時直接跳到任一畫面。
 * 進度對照 Document/README.md，正式版本應移除。
 */

const groups = [
  {
    title: '首頁 Agent',
    items: [
      { to: '/', label: '活動示意', file: '初步確定方向/agent-home-activity.png' },
      { to: '/interests', label: '興趣調查', file: '初步確定方向/agent-home-interests.png' },
      { to: '/commute-setup', label: '通勤路線設定', file: '初步確定方向/agent-home-commute-setup.png' },
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
      { to: '/ride/driver', label: '③ 司機前往中', file: '初步確定方向/yoxi-driver-arriving.png' },
      { to: '/ride/trip', label: '④ 行程進行中', file: '初步確定方向/yoxi-trip-in-progress.png' },
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
  return (
    <div className="px-5 py-5">
      <h1 className="text-[20px] font-bold">畫面清單</h1>
      <p className="mt-1 text-[13px] text-subtle">
        設計稿 {total} 張，全部已實作
      </p>

      <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[12px] leading-[1.7] text-muted">
        <p className="font-semibold text-ink">可走的流程</p>
        <p>下雨情境 →「立即叫車」→ 預估車資 → 確認叫車 → 司機前往中 →（點狀態列）→ 行程進行中</p>
      </div>

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 mt-6 text-[13px] font-semibold text-muted">{g.title}</h2>
          <ul className="space-y-2">
            {g.items.map((s) => (
              <li key={s.to}>
                <Link
                  to={s.to}
                  className="block rounded-xl border border-primary/30 bg-primary-tint px-4 py-3"
                >
                  <p className="text-[15px] font-semibold text-primary">{s.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{s.file}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
