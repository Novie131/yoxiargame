import { Capacitor } from '@capacitor/core'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'

import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'

/* 各張設計稿的狀態列時間不一樣，對照著顯示比較好比對 */
const statusTimeByRoute: Record<string, string> = {
  '/trips': '14:10',
  '/explore': '14:10',
  '/ride/booking': '14:10',
  '/ride/estimate': '14:10',
  '/ride/trip': '14:10',
}

/* 這些設計稿是全螢幕流程，沒有 tab bar */
const routesWithoutTabBar = new Set(['/ride/estimate'])

/*
 * 手機殼。桌機瀏覽器開的時候夾在中間並限制寬度，比較接近設計稿的比例；
 * 真機上就是滿版。
 *
 * 狀態列的處理：真機上時間/訊號/電池由作業系統繪製，所以 StatusBar 不渲染，
 * 改用 safe-area 內距把內容推到系統狀態列下方；瀏覽器預覽才畫假的狀態列。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const native = Capacitor.isNativePlatform()

  return (
    <div
      className={[
        'mx-auto flex h-full w-full max-w-[430px] flex-col bg-surface shadow-[0_0_40px_rgba(0,0,0,.08)]',
        native ? 'safe-top' : '',
      ].join(' ')}
    >
      <StatusBar time={statusTimeByRoute[pathname] ?? '09:41'} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      {!routesWithoutTabBar.has(pathname) && <TabBar />}
    </div>
  )
}
