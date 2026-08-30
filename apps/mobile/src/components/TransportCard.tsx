import type { ReactNode } from 'react'

import { FlameIcon } from './icons'

/*
 * 對話裡的交通建議卡。四張稿共用同一個版型：
 * 左上分類 chip、右上推薦標籤、標題、內容、整寬主色 CTA。
 * 標籤圖示會變（🔥 熱門 / ⚡ 推薦 / ⭐ 常用），文字色四張都是主色。
 */
export function TransportCard({
  chip,
  badge,
  badgeIcon,
  title,
  cta,
  onCta,
  children,
}: {
  chip: string
  badge: string
  badgeIcon?: ReactNode
  title: string
  cta: string
  onCta?: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-3 rounded-xl border border-primary-muted bg-primary-tint p-3">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white">
          {chip}
        </span>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-primary">
          {badgeIcon ?? <FlameIcon />}
          {badge}
        </span>
      </div>

      <h3 className="mt-2.5 text-[16px] font-bold">{title}</h3>

      <div className="mt-2">{children}</div>

      <button
        type="button"
        onClick={onCta}
        className="mt-3 w-full rounded-lg bg-primary py-3 text-[15px] font-semibold text-white transition-transform active:scale-[.98]"
      >
        {cta}
      </button>
    </div>
  )
}
