import type { ReactNode } from 'react'

/*
 * 叫車流程四張稿共用的底部面板。
 *
 * 這裡曾經為了讓開 tab bar 中央那顆浮出來的鈕而多留一截底部空間。
 * 現在不需要了 —— 那顆鈕改由 TabBar 自己保留高度（見 TabBar 的 pt-4），
 * 不再突出到別人的版面裡。留著的話會變成一塊沒有理由的空白。
 */
export function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-t-3xl bg-surface px-4 pb-3 pt-2.5 shadow-[0_-4px_20px_rgba(22,32,55,.10)]">
      <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line/70" />
      {children}
    </div>
  )
}
