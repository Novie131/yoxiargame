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
  /* 在助理頁就去叫車；其他任何地方（含叫車流程）都回助理 */
  const centerTo = onAgent ? RIDE_ENTRY : '/'

  return (
    /*
     * pt-4 是給中央那顆鈕**保留**的空間，不是裝飾性的留白。
     *
     * 那顆鈕用 -top-4 往上突出 16px。在這之前它是突出到 nav 之外的，
     * 於是壓在上方內容的底部 —— 聊天頁蓋到輸入列、叫車頁蓋到 CTA。
     * 每個貼著 tab bar 的畫面都會中招。
     *
     * 一頁一頁補下邊距治不了本（新畫面還是會再踩一次），所以改成
     * **nav 自己把那一截高度算進來**：鈕的上緣剛好落在 nav 的邊界線上，
     * 視覺上仍然是浮出來的，但它不再侵占任何人的空間。
     *
     * 數值要跟下面的 -top-4 對得起來，兩個一起改。
     */
    <nav className="safe-bottom shrink-0 border-t border-black/5 bg-surface pt-4">
      <div className="relative grid h-14 grid-cols-5 items-center">
        {tabs.map(({ to, label, Icon }, i) => (
          <NavLink
            key={to}
            to={to}
            // 中央那格留給 agent 按鈕，所以第 3 格要跳過
            style={{ gridColumnStart: i < 2 ? i + 1 : i + 2 }}
            /* 同上：預設焦點框在這排小圖示上一樣突兀 */
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
          * 中央鈕 —— 設計稿裡是浮出 tab bar 的圓形 logo 鈕。
          *
          * 用 Link 而不是 NavLink：它的去處會變，「現在是否選中」對它沒有意義，
          * 高亮改由 onAgent / onRide 自己判斷。
          */}
        <Link
          to={centerTo}
          aria-label={onAgent ? '叫車' : 'yoxi 助理'}
          /*
           * outline-none + focus-visible：點下去之後瀏覽器會把焦點留在這顆鈕上，
           * 預設的藍色外框會整圈套在紅色圓鈕外面，很顯眼也不屬於這套配色。
           *
           * 不是直接拿掉 outline —— 那會讓鍵盤使用者看不出焦點在哪。
           * focus-visible 只在鍵盤操作時才套用，觸控與滑鼠點擊不會觸發。
           */
          className="absolute left-1/2 -translate-x-1/2 -top-4 flex h-14 w-14 items-center justify-center rounded-full outline-none transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-ink/25"
          style={{
            background: 'var(--color-brand-red)',
            /*
             * 兩層 box-shadow，各有各的工作：
             *
             * 1. 白色實心環 —— 這顆鈕壓在 tab bar 的上緣分隔線上，沒有環的話
             *    那條線會直接穿過鈕的兩側，看起來像鈕被線切開。環把線切斷，
             *    鈕才像是「浮在上面」而不是「貼在上面」。
             *    用 box-shadow 而不是 border：border 會吃掉內距、把圖示擠小。
             *
             * 2. 中性陰影 —— 原本這裡是 rgba(234,62,40,.45) 的品牌色光暈，
             *    在白底上會暈成一塊橘色髒污（實機看很明顯）。
             *    陰影的工作是表達高度，不是表達顏色，所以改回中性的墨色。
             *
             * 也不再分「在不在這兩個模式裡」給不同陰影 —— 一顆鈕忽明忽暗
             * 會被讀成故障。它現在要去哪裡，圖示已經講得很清楚了。
             */
            boxShadow:
              '0 0 0 4px var(--color-surface), 0 6px 16px rgba(22, 32, 55, .22)',
          }}
        >
          {onAgent ? <CarIcon active className="h-[30px] w-[30px]" /> : <YoxiMark />}
        </Link>
      </div>
    </nav>
  )
}
