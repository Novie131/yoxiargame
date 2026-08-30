import type { ReactNode } from 'react'

/* 叫車流程四張稿共用的底部面板 */
export function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-t-3xl bg-surface px-4 pb-3 pt-2.5 shadow-[0_-4px_20px_rgba(22,32,55,.10)]">
      <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line/70" />
      {children}
    </div>
  )
}
