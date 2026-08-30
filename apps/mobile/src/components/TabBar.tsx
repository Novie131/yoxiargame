import { NavLink, useLocation } from 'react-router'

import {
  ExploreIcon,
  MemberIcon,
  SettingsIcon,
  TripsIcon,
  YoxiMark,
} from './icons'

const tabs = [
  { to: '/trips', label: '行程', Icon: TripsIcon },
  { to: '/explore', label: '探索', Icon: ExploreIcon },
  { to: '/settings', label: '設定', Icon: SettingsIcon },
  { to: '/member', label: '會員', Icon: MemberIcon },
] as const

export function TabBar() {
  const { pathname } = useLocation()
  const agentActive = pathname === '/'

  return (
    <nav className="safe-bottom shrink-0 border-t border-black/5 bg-surface">
      <div className="relative grid h-14 grid-cols-5 items-center">
        {tabs.map(({ to, label, Icon }, i) => (
          <NavLink
            key={to}
            to={to}
            // 中央那格留給 agent 按鈕，所以第 3 格要跳過
            style={{ gridColumnStart: i < 2 ? i + 1 : i + 2 }}
            className="flex flex-col items-center gap-0.5"
          >
            {({ isActive }) => (
              <>
                <Icon active={isActive} />
                <span
                  className="text-[10px]"
                  style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-muted)' }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* 中央 agent 入口 —— 設計稿裡是浮出 tab bar 的圓形 logo 鈕 */}
        <NavLink
          to="/"
          aria-label="yoxi 助理"
          className="absolute left-1/2 -translate-x-1/2 -top-4 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
          style={{
            background: 'var(--color-brand-red)',
            boxShadow: agentActive
              ? '0 6px 18px rgba(234,62,40,.45)'
              : '0 4px 12px rgba(0,0,0,.18)',
          }}
        >
          <YoxiMark />
        </NavLink>
      </div>
    </nav>
  )
}
