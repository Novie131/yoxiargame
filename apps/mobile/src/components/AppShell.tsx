import { Capacitor } from '@capacitor/core'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'

import { hasTabBar } from '@/lib/layout'

import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'

/*
 * 手機殼。寬度超過 max-w-shell 時夾在中間，比較接近設計稿的比例。
 * 直向手機本來就比它窄，所以是滿版；平板、桌機與手機橫向（真機也一樣）
 * 會是置中的一欄 —— 這套版面只為直向手機設計，拉寬只會讓卡片變得空洞。
 *
 * 狀態列的處理：真機上時間/訊號/電池由作業系統繪製，所以 StatusBar 不渲染，
 * 改用 safe-area 內距把內容推到系統狀態列下方；只有桌機瀏覽器預覽才畫假的狀態列。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const native = Capacitor.isNativePlatform()

  return (
    <div
      className={[
        'mx-auto flex h-full w-full max-w-shell flex-col bg-surface shadow-[0_0_40px_rgba(0,0,0,.08)]',
        /*
         * safe-x 是給橫向用的 —— 轉橫之後瀏海與圓角在左右兩側，
         * 只補 safe-top 的話內容會被切掉一條。
         */
        native ? 'safe-top safe-x' : '',
      ].join(' ')}
    >
      <StatusBar />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      {hasTabBar(pathname) && <TabBar />}
    </div>
  )
}
