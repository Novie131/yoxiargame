/* 首頁上方的情境提示橫幅（下雨 / 紫外線各一個配色） */
export function SituationBanner({
  tone,
  icon,
  children,
}: {
  tone: 'cool' | 'warm'
  icon: string
  children: React.ReactNode
}) {
  const bg = tone === 'cool' ? 'var(--color-banner-cool)' : 'var(--color-banner-warm)'
  const fg =
    tone === 'cool' ? 'var(--color-banner-cool-ink)' : 'var(--color-banner-warm-ink)'

  return (
    <div
      className="flex items-start gap-2 px-5 py-3 text-[13px] font-semibold leading-[1.6]"
      style={{ background: bg, color: fg }}
    >
      <span className="shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  )
}
