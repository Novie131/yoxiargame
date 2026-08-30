import type { ReactNode } from 'react'

/*
 * 地圖底圖。目前用設計稿裁下來的靜態圖，之後接 MapLibre GL JS 時
 * 只要把這個元件內部換掉，上層四個畫面完全不用動。
 */
export function MapBackdrop({
  src,
  children,
}: {
  src: string
  children?: ReactNode
}) {
  return (
    <div
      className="relative min-h-0 flex-1 bg-surface-3 bg-cover bg-center"
      style={{ backgroundImage: `url(${src})` }}
      role="img"
      aria-label="地圖"
    >
      {children}
    </div>
  )
}
