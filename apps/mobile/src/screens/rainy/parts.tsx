import type { ReactNode } from 'react'
import { Link } from 'react-router'

/*
 * 雨天通勤四頁（Figma 499:1800 / 499:1916 / 499:2039 / 499:2185）共用的版型零件。
 * 四張稿的頁首、卡片、小標籤長得一樣，各寫一份遲早會差一兩個 px。
 */

/** 整頁底：設計稿是偏暖的米白，不是一般頁面的灰白 */
export function RainyPage({ children }: { children: ReactNode }) {
  return <div className="flex-1 bg-primary-tint-2 px-4 pb-6 pt-3">{children}</div>
}

/** 「‹ 返回首頁」＋大標＋主色副標 */
export function RainyHeader({
  back,
  backTo,
  title,
  subtitle,
}: {
  back: string
  backTo: string
  title: string
  subtitle: string
}) {
  return (
    <header>
      <Link
        to={backTo}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 text-[14px] text-muted"
      >
        <BackChevron />
        {back}
      </Link>
      <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
      <p className="mt-1 text-[13px] font-semibold text-primary">{subtitle}</p>
    </header>
  )
}

/** 右上角的小標籤（常用路線、示意預估、雨天推薦…） */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-md bg-primary-tint px-2 py-0.5 text-[11px] font-semibold text-primary">
      {children}
    </span>
  )
}

/** 白底細框卡片。tone="primary" 是被推薦的那張（主色框＋淡底）。 */
export function Card({
  children,
  tone = 'plain',
  className = '',
}: {
  children: ReactNode
  tone?: 'plain' | 'primary' | 'tint'
  className?: string
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-primary bg-primary-tint-2'
      : tone === 'tint'
        ? 'border-primary-muted/60 bg-primary-tint/60'
        : 'border-black/[.08] bg-surface'
  return <div className={`rounded-card border p-4 ${toneClass} ${className}`}>{children}</div>
}

/** 兩欄的「標題・預估 / 數字」 */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-subtle">{label}</p>
      <p className="mt-0.5 text-[18px] font-bold max-[359px]:text-[16px]">{value}</p>
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-primary py-3.5 text-[16px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-45"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl border border-black/[.12] bg-surface py-3.5 text-[16px] font-bold text-ink transition-transform active:scale-[.98] disabled:opacity-45"
    >
      {children}
    </button>
  )
}

/* ── 圖示（照設計稿描的線稿，跟 components/icons 同一種畫法） ── */

const P = 'var(--color-primary)'
const INK = 'var(--color-ink)'

type IconProps = { className?: string; color?: string }

function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path d="m14.5 5-7 7 7 7" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function UmbrellaIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
      <path d="M3 12a9 9 0 0 1 18 0H3Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 12v6.5a2 2 0 0 1-4 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function CarOutlineIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="26" height="26" aria-hidden>
      <path
        d="M3 15.5v-2.7L5.2 9h13.6l2.2 3.8v2.7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="16.5" r="1.8" stroke={color} strokeWidth="1.7" fill="var(--color-surface)" />
      <circle cx="16.5" cy="16.5" r="1.8" stroke={color} strokeWidth="1.7" fill="var(--color-surface)" />
    </svg>
  )
}

export function MetroIcon({ className, color = INK }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden>
      <rect x="6" y="3.5" width="12" height="13" rx="4" stroke={color} strokeWidth="1.7" />
      <path d="M6 10h12" stroke={color} strokeWidth="1.7" />
      <circle cx="9.5" cy="13.2" r="1" fill={color} />
      <circle cx="14.5" cy="13.2" r="1" fill={color} />
      <path d="m8.5 16.5-2 4m9-4 2 4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function WalkIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path d="M8 4.5c1.6 0 2.3 2 2.1 4.5S9 13 8 13s-2-1.5-2-4 .4-4.5 2-4.5Z" stroke={color} strokeWidth="1.6" />
      <path d="M7 15.5h2.4v1.6a1.2 1.2 0 0 1-2.4 0v-1.6Z" stroke={color} strokeWidth="1.6" />
      <path d="M16 7.5c1.6 0 2 2 2 4.5s-1 4-2 4-2.1-1.5-2.1-4 .5-4.5 2.1-4.5Z" stroke={color} strokeWidth="1.6" />
      <path d="M14.8 18.5h2.4v1.2a1.2 1.2 0 0 1-2.4 0v-1.2Z" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export function TransferIcon({ className, color = INK }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path d="M5 8h13m0 0-3.5-3.5M18 8l-3.5 3.5M19 16H6m0 0 3.5-3.5M6 16l3.5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FlagIcon({ className, color = INK }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
      <path d="M5.5 21V4m0 0h11l-2 4 2 4h-11" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PinOutlineIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" stroke={color} strokeWidth="1.7" />
    </svg>
  )
}

export function HouseIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 21v-5.5h4V21" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

export function BuildingIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden>
      <path d="M4 21V6.5L13 3v18M13 9.5h6a1 1 0 0 1 1 1V21M2.5 21h19" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7.5 9h2m-2 4h2m-2 4h2m7-4h.5m-.5 4h.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function WalletIcon({ className, color = INK }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" stroke={color} strokeWidth="1.7" />
      <path d="M20.5 10.5h-4a2 2 0 0 0 0 4h4M6 6l9-2.5V6" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

export function ShirtIcon({ className, color = P }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
      <path
        d="M9 3.5 4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-5-2.5a3 3 0 0 1-6 0Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 逐時預報與頁首用的天氣線稿 */
export function WeatherIcon({
  kind,
  className,
  color = INK,
  size = 20,
}: IconProps & { kind: 'rain' | 'showers' | 'cloudy'; size?: number }) {
  const cloud = 'M7 15h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6-1.2A3.9 3.9 0 0 0 7 15Z'
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden>
      <path d={kind === 'cloudy' ? 'M7 18h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6-1.2A3.9 3.9 0 0 0 7 18Z' : cloud} stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      {kind === 'rain' && (
        <path d="M9 17.5v3M12 17.5v3M15 17.5v3" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      )}
      {kind === 'showers' && (
        <path d="M9 18h.01M12 18h.01M15 18h.01M10.5 20.5h.01M13.5 20.5h.01" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  )
}
