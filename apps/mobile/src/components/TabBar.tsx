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

/*
 * 底部導覽列。
 *
 * ── 為什麼中央鈕不再浮出 tab bar ──
 * 設計稿畫的是一顆浮出上緣的圓形鈕。實作過之後發現那個做法有兩個躲不掉的問題：
 *
 *   1. 它會壓住上方內容的底部。聊天頁蓋到輸入列、叫車頁蓋到 CTA，
 *      而且每新增一個貼著 tab bar 的畫面就會再中一次。
 *   2. 「浮出」與「和圖示列對齊」在幾何上互斥 —— 突出多少，
 *      視覺中心就偏離圖示中心多少（突出量的一半）。
 *
 * 試過讓 nav 自己保留突出的高度，重疊是沒了，但 tab bar 被撐高一截、
 * 圖示列被壓低，換成另一種難看。
 *
 * 所以改成**收進列內**：鈕比圖示大一圈（48px vs 24px）來保持份量，
 * 但和它們在同一列垂直置中。沒有重疊、沒有錯位、之後新增畫面也不用讓開。
 * 代價是少了設計稿那個浮出的品牌感 —— 這是有意識的取捨。
 */
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
  /* 在助理頁就去叫車；其他任何地方（含叫車流程）都回助理 */
  const centerTo = onAgent ? RIDE_ENTRY : '/'

  return (
    <nav className="safe-bottom shrink-0 border-t border-black/5 bg-surface">
      <div className="grid h-14 grid-cols-5 items-center">
        {tabs.map(({ to, label, Icon }, i) => (
          <NavLink
            key={to}
            to={to}
            // 中央那格留給切換鈕，所以第 3 格要跳過
            style={{ gridColumnStart: i < 2 ? i + 1 : i + 2 }}
            /* 預設的焦點外框套在這排小圖示上很突兀，改成只在鍵盤操作時出現 */
            className="flex flex-col items-center gap-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
          * 中央鈕。就是格線裡的第 3 格，不是絕對定位的浮層 ——
          * 所以它不會蓋到任何東西，也不需要誰為它讓開。
          *
          * 用 Link 而不是 NavLink：它的去處會變，「現在是否選中」對它沒有意義。
          *
          * gridRowStart: 1 不能省。它在 DOM 裡排在第 5 格之後，只指定欄的話，
          * 格線的自動排列遇到「欄號比前一個小」會換到下一列 ——
          * 這顆鈕就會被放到第 2 列，掉出固定高度的 tab bar 外面。
          */}
        <Link
          to={centerTo}
          aria-label={onAgent ? '叫車' : 'yoxi 助理'}
          style={{ gridColumnStart: 3, gridRowStart: 1, background: 'var(--color-brand-red)' }}
          /*
           * h-12（48px）在 h-14（56px）的列裡上下各留 4px，比圖示大一圈
           * 但不會頂到邊。陰影只用中性墨色表達高度 ——
           * 之前用品牌紅的光暈，在白底上會暈成一塊橘色髒污。
           */
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(22,32,55,.20)] outline-none transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-ink/25"
        >
          {onAgent ? <CarIcon active className="h-7 w-7" /> : <YoxiMark className="h-7 w-7" />}
        </Link>
      </div>
    </nav>
  )
}
