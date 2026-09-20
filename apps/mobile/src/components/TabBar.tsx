import { Link, NavLink, useLocation } from 'react-router'

import {
  CarIcon,
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

/* 叫車流程的入口。中央鈕與快捷鍵都從這裡進，不要各自寫死一份。 */
const RIDE_ENTRY = '/ride/booking'

export function TabBar() {
  const { pathname } = useLocation()

  /*
   * 中央那顆鈕在「助理」與「叫車」之間來回切換。
   *
   * 這兩個是這個 App 的兩種模式（問事情 vs. 叫車），切換很頻繁，
   * 但各給一格 tab 會把下排擠成六格 —— 所以收進同一顆鈕。
   *
   * 圖示一律顯示**按下去會到哪裡**，不是現在在哪裡：
   * 它是一個動作鈕不是狀態指示，畫成目前位置的話，使用者得先在心裡
   * 反一次才知道按了會發生什麼。
   */
  const onAgent = pathname === '/'
  const onRide = pathname.startsWith('/ride')
  /* 在助理頁就去叫車；其他任何地方（含叫車流程）都回助理 */
  const centerTo = onAgent ? RIDE_ENTRY : '/'

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

        {/*
          * 中央鈕 —— 設計稿裡是浮出 tab bar 的圓形 logo 鈕。
          *
          * 用 Link 而不是 NavLink：它的去處會變，「現在是否選中」對它沒有意義，
          * 高亮改由 onAgent / onRide 自己判斷。
          */}
        <Link
          to={centerTo}
          aria-label={onAgent ? '叫車' : 'yoxi 助理'}
          className="absolute left-1/2 -translate-x-1/2 -top-4 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
          style={{
            background: 'var(--color-brand-red)',
            /* 人在這顆鈕管的兩個模式裡時才發光 */
            boxShadow:
              onAgent || onRide
                ? '0 6px 18px rgba(234,62,40,.45)'
                : '0 4px 12px rgba(0,0,0,.18)',
          }}
        >
          {onAgent ? <CarIcon active className="h-[30px] w-[30px]" /> : <YoxiMark />}
        </Link>
      </div>
    </nav>
  )
}
