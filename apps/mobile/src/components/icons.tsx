/*
 * Tab bar 圖示。目前是照截圖描的近似線稿 —— 拿到 Figma 切圖後應整批換掉。
 */
type IconProps = { active?: boolean; className?: string }

const stroke = (active?: boolean) => (active ? 'var(--color-primary)' : 'var(--color-muted)')

export function TripsIcon({ active, className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24">
      <path
        d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13"
        stroke={stroke(active)}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExploreIcon({ active, className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24">
      <circle cx="12" cy="12" r="9" stroke={stroke(active)} strokeWidth="1.6" />
      <path
        d="m15.5 8.5-2 5-5 2 2-5 5-2Z"
        stroke={stroke(active)}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SettingsIcon({ active, className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24">
      <circle cx="12" cy="12" r="3" stroke={stroke(active)} strokeWidth="1.6" />
      <path
        d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.2 5.2l1.4 1.4m10.8 10.8 1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        stroke={stroke(active)}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MemberIcon({ active, className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="24" height="24">
      <circle cx="12" cy="8" r="3.5" stroke={stroke(active)} strokeWidth="1.6" />
      <path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        stroke={stroke(active)}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MicIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function KeyboardIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke="var(--color-muted)" strokeWidth="1.5" />
      <path
        d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8 15.5h8"
        stroke="var(--color-muted)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18">
      <circle cx="12" cy="12" r="4" fill="#E8A33D" />
      <path
        d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        stroke="#E8A33D"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/*
 * yoxi logo 佔位。真的 logo 是 Figma 裡的向量圖，這裡先用近似形狀，
 * 拿到 SVG 資產後直接替換這個元件即可。
 */
export function YoxiMark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" width="34" height="34">
      <path
        d="M30 12c-8 0-14 4.5-14 11 0 3.6 2.2 6.5 5.6 8.1L20 38l8.4-5.6c6-.9 10.6-5 10.6-10.4 0-6.5-6-10-9-10Z"
        fill="#fff"
      />
    </svg>
  )
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="14" height="14">
      <circle cx="12" cy="12" r="9" stroke="var(--color-muted)" strokeWidth="1.8" />
      <path d="M12 7v5.2l3.2 2" stroke="var(--color-muted)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path
        d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"
        stroke="var(--color-muted)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.4" stroke="var(--color-muted)" strokeWidth="1.8" />
    </svg>
  )
}

export function FlameIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="13" height="13">
      <path
        d="M12 2.5s5.5 4.2 5.5 9a5.5 5.5 0 1 1-11 0c0-2 1-3.4 1.8-4.3.3 1 1 1.8 1.9 1.8 1.4 0 1.8-1.6 1.8-6.5Z"
        fill="var(--color-primary)"
      />
    </svg>
  )
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="26" height="26">
      <path
        d="M12 3a6 6 0 0 0-6 6c0 4-1.5 5.5-1.5 5.5h15S18 13 18 9a6 6 0 0 0-6-6Z"
        stroke="var(--color-ink)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="var(--color-ink)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/* ── 叫車流程用的圖示 ── */

const P = 'var(--color-primary)'

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20">
      <circle cx="11" cy="11" r="6.5" stroke={P} strokeWidth="2" />
      <path d="m16 16 4 4" stroke={P} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path
        d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
        stroke={P}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlaneIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="17" height="17">
      <path
        d="M21 15.5 3 9.8l2.4-1.6 4.4.9 3-2.4-6.3-3L9 2l9.2 3.6 2.3-1.5a1.7 1.7 0 0 1 1.9 2.8l-1.6 1.1 1.6 6"
        stroke={P}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="17" height="17">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
        stroke={P}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StarIcon({ className, active }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="17" height="17">
      <path
        d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z"
        stroke={active ? '#E8A33D' : P}
        fill={active ? '#E8A33D' : 'none'}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path
        d="m14.5 5-7 7 7 7"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CrosshairIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="12" cy="12" r="4.5" stroke={P} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.6" fill={P} />
      <path
        d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3"
        stroke={P}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18">
      <path
        d="M21 11.5c0 4-4 7-9 7a10 10 0 0 1-2.6-.34L4 20l1.3-3.3A6.7 6.7 0 0 1 3 11.5c0-4 4-7 9-7s9 3 9 7Z"
        stroke={P}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18">
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z"
        stroke={P}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="17" height="17">
      <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" stroke={P} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke={P} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="17" height="17">
      <path d="M12 4 2.5 20h19L12 4Z" stroke={P} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 10v4m0 2.5h.01" stroke={P} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function CarIcon({ className, active }: IconProps) {
  const c = active ? '#fff' : 'var(--color-ink)'
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path
        d="M3 15v-2.2L5 8h14l2 4.8V15m-18 0h18m-18 0v2h3v-2m15 0v2h-3v-2"
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TaxiIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="18" height="18">
      <path d="M9 3.5h6v2H9z" fill={P} />
      <path
        d="M3 15v-2.2L5 8h14l2 4.8V15m-18 0h18m-18 0v2h3v-2m15 0v2h-3v-2"
        stroke={P}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="20" height="20">
      <rect x="4.5" y="4" width="15" height="17" rx="2.5" stroke={P} strokeWidth="1.7" />
      <path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1H9v-1Z" fill={P} />
      <path d="M8.5 11h7M8.5 15h4.5" stroke={P} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function MapPinIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" width="13" height="13">
      <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z" fill={P} />
    </svg>
  )
}
