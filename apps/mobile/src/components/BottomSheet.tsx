import type { ReactNode } from 'react'
import { useLocation } from 'react-router'

import { CENTER_BUTTON_OVERHANG_PX, hasTabBar } from '@/lib/layout'

/*
 * 叫車流程四張稿共用的底部面板。
 *
 * 底部要多留一塊給 tab bar 中央那顆浮出來的鈕：它突出 tab bar 上緣 16px，
 * 壓的正是面板最底下那顆 CTA 的正中央 —— 也就是使用者真正要按的地方。
 * 留白抓兩倍的突出高度，一半是淨空、一半是呼吸空間，不要剛好貼齊。
 *
 * 沒有 tab bar 的那幾頁（估價頁）不留 —— 那裡沒有東西會壓上來，
 * 留了就是一塊解釋不了的空白。
 */
export function BottomSheet({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div
      className="shrink-0 rounded-t-3xl bg-surface px-4 pt-2.5 shadow-[0_-4px_20px_rgba(22,32,55,.10)]"
      style={{
        paddingBottom: hasTabBar(pathname) ? CENTER_BUTTON_OVERHANG_PX * 2 : 12,
      }}
    >
      <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line/70" />
      {children}
    </div>
  )
}
