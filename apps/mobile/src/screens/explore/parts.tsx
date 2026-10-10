import { useState, type ReactNode, type Ref } from 'react'

import { KeyboardIcon, MicIcon, SearchIcon, SendIcon } from '@/components/icons'
import type { PlaceKind } from '@/lib/explorePlan'
import { useSpeechInput } from '@/lib/speech'

import type { Sky } from './hooks'

/*
 * 探索頁與情境小行程（Figma 536:1672 / 536:1791 / 536:1894）共用的小元件。
 *
 * 設計稿的照片我們沒有（也不該去網路抓），一律用色塊加圖示代替，
 * 並照設計稿保留「示意照片」標籤。
 */

const Dot = () => <span className="mx-1.5 text-subtle">・</span>

/** 標題下面那兩行天氣 */
export function WeatherLines({ sky }: { sky: Sky }) {
  if (sky.status === 'loading') {
    return <p className="mt-1 text-[13px] text-subtle">取得目前天氣…</p>
  }
  if (sky.status === 'error') {
    return <p className="mt-1 text-[13px] text-subtle">天氣資料暫時無法取得</p>
  }
  return (
    <>
      <p className="mt-0.5 truncate text-[14px] text-muted">
        {sky.place}
        <Dot />
        {sky.temperature}°C {sky.condition}
      </p>
      <p className="mt-1 text-[12px] text-subtle">
        {sky.rainChance !== null && (
          <>
            降雨機率{sky.rainChance}%
            <Dot />
          </>
        )}
        體感{sky.feelsLike}°C
        <Dot />
        {sky.updated}更新
      </p>
    </>
  )
}

/** 標題右邊那個天氣圖示方塊 */
export function WeatherBadge({ sky }: { sky: Sky }) {
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-4 text-muted"
      aria-hidden
    >
      {sky.rainy ? <CloudRainLine width={26} height={26} /> : <CloudLine width={26} height={26} />}
    </span>
  )
}

/* ── 標籤、照片替身 ── */

export function TagChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-primary-tint px-3 py-1 text-[13px] font-semibold text-primary">
      {children}
    </span>
  )
}

const KIND_STYLE: Record<PlaceKind, string> = {
  book: 'bg-warning-tint text-banner-warm-ink',
  coffee: 'bg-primary-tint text-primary',
  art: 'bg-info-tint text-info',
  museum: 'bg-surface-4 text-muted',
  trail: 'bg-success-tint text-success',
  food: 'bg-banner-warm text-banner-warm-ink',
}

export function PlaceIcon({ kind, size = 24 }: { kind: PlaceKind; size?: number }) {
  const props = { width: size, height: size }
  switch (kind) {
    case 'book':
      return <BookIcon {...props} />
    case 'coffee':
      return <CoffeeIcon {...props} />
    case 'art':
      return <ArtIcon {...props} />
    case 'museum':
      return <MuseumIcon {...props} />
    case 'trail':
      return <WalkIcon {...props} />
    case 'food':
      return <BowlIcon {...props} />
  }
}

/** 地點縮圖的替身：色塊＋圖示。沒有真照片就不放照片。 */
export function PlaceThumb({ kind, className = '' }: { kind: PlaceKind; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${KIND_STYLE[kind]} ${className}`}
      aria-hidden
    >
      <PlaceIcon kind={kind} size={26} />
    </span>
  )
}

/** 主題大圖的替身，左上角照設計稿標「示意照片」 */
export function HeroPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center gap-6 overflow-hidden rounded-xl bg-banner-cool text-banner-cool-ink ${className}`}
      role="img"
      aria-label="示意照片：雨天的書店與咖啡店"
    >
      <span className="absolute left-2.5 top-2.5 rounded-md bg-ink/70 px-2 py-0.5 text-[11px] text-white">
        示意照片
      </span>
      <CloudRainLine width={40} height={40} />
      <BookIcon width={44} height={44} />
      <CoffeeIcon width={40} height={40} />
    </div>
  )
}

/* ── 底部輸入列 ── */

/*
 * 探索頁的「搜尋景點、主題與小行程」與小行程頁的「說說你想怎麼調整…」。
 *
 * 跟 components/ChatComposer 同一套行為（右邊那顆：沒字是麥克風、有字是送出；
 * 語音結果先填進框裡讓人確認），差在左邊的圖示，而且要能從外面 focus
 * （小行程頁的「調整」會把游標帶到這裡）。
 */
export function PromptBar({
  placeholder,
  onSubmit,
  leading = 'search',
  inputRef,
}: {
  placeholder: string
  onSubmit: (text: string) => void
  leading?: 'search' | 'keyboard'
  inputRef?: Ref<HTMLInputElement>
}) {
  const [value, setValue] = useState('')
  const [interim, setInterim] = useState('')
  const speech = useSpeechInput({
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        setInterim('')
        setValue((prev) => (prev ? `${prev} ${text}` : text))
      } else {
        setInterim(text)
      }
    },
  })

  const hasText = value.trim().length > 0
  const micMode = !hasText && speech.supported
  const shown = interim ? (value ? `${value} ${interim}` : interim) : value

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    if (speech.listening) speech.stop()
    onSubmit(text)
    setValue('')
    setInterim('')
  }

  return (
    <div className="sticky bottom-0 z-10 border-t border-black/5 bg-surface">
      {speech.error && (
        <p className="px-5 pt-2 text-[12px] text-primary" role="status">
          {speech.error}
        </p>
      )}
      <form onSubmit={submit} className="flex items-center gap-3 px-4 py-2.5">
        {leading === 'search' ? <SearchIcon /> : <KeyboardIcon />}
        <input
          ref={inputRef}
          value={shown}
          onChange={(e) => {
            setValue(e.target.value)
            setInterim('')
          }}
          readOnly={speech.listening}
          enterKeyHint="send"
          aria-label={placeholder}
          placeholder={speech.listening ? '聆聽中，請說話…' : placeholder}
          className="h-11 min-w-0 flex-1 rounded-full bg-primary-tint-2 px-4 text-[16px] outline-none placeholder:text-subtle"
        />
        <button
          type={micMode ? 'button' : 'submit'}
          aria-label={micMode ? (speech.listening ? '停止語音輸入' : '語音輸入') : '送出'}
          aria-pressed={micMode ? speech.listening : undefined}
          onClick={micMode ? speech.toggle : undefined}
          disabled={!micMode && !hasText}
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            'transition-transform active:scale-95 disabled:opacity-60',
            speech.listening ? 'animate-pulse bg-ink' : 'bg-primary',
          ].join(' ')}
        >
          {micMode ? <MicIcon /> : <SendIcon />}
        </button>
      </form>
    </div>
  )
}

/* ── 圖示（線稿，顏色跟著 currentColor） ── */

type SvgProps = { width?: number; height?: number; className?: string }

function Line({ width = 24, height = 24, className, children }: SvgProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function CloudRainLine(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M7 15.5h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 7 15.5Z" />
      <path d="M9 18.5 8.3 20.5M12.5 18.5l-.7 2M16 18.5l-.7 2" />
    </Line>
  )
}

export function CloudLine(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M7 18h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 7 18Z" />
    </Line>
  )
}

export function BookIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M12 6.5C10.5 5.3 8 4.8 4 5v13c4-.2 6.5.3 8 1.5 1.5-1.2 4-1.7 8-1.5V5c-4-.2-6.5.3-8 1.5Z" />
      <path d="M12 6.5v13" />
    </Line>
  )
}

export function CoffeeIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5" />
    </Line>
  )
}

function ArtIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <rect x="4" y="5" width="16" height="13" rx="1.5" />
      <path d="m4.5 16 4.5-4.5 3 3 2.5-2.5 5 4.5" />
      <circle cx="15.5" cy="9" r="1.3" />
    </Line>
  )
}

function MuseumIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M3.5 9 12 4.5 20.5 9M5 9.5V17M9.5 9.5V17M14.5 9.5V17M19 9.5V17M3.5 19.5h17" />
    </Line>
  )
}

function BowlIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M4 11h16a8 8 0 0 1-16 0ZM9 4.5c-.8 1 .8 2-.1 3M13 4.5c-.8 1 .8 2-.1 3" />
    </Line>
  )
}

export function WalkIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M8.5 4c-2 0-3 2-3 4.5S6.5 12 8 12s2-1.6 2-4-1-4-1.5-4ZM6.5 14.5l3 .5-.5 3a1.5 1.5 0 0 1-3-.5v-3ZM15.5 7c2 0 3 2 3 4.5S17.5 15 16 15s-2-1.6-2-4 1-4 1.5-4ZM17.5 17.5l-3 .5.5 3a1.5 1.5 0 0 0 3-.5v-3Z" />
    </Line>
  )
}

export function MetroIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <rect x="6" y="3.5" width="12" height="13" rx="4" />
      <path d="M6 10.5h12M9 13.5h.01M15 13.5h.01M8.5 20.5l1.5-4M15.5 20.5l-1.5-4" />
    </Line>
  )
}

export function CarLine(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M3.5 15.5v-3l2-4.5h13l2 4.5v3h-17ZM6 15.5V18M18 15.5V18M7.5 12.5h.01M16.5 12.5h.01" />
    </Line>
  )
}

export function SparkleIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5 8.4 8 10 3.5ZM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </Line>
  )
}

export function ArrowDownIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
    </Line>
  )
}

export function ChevronRightIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Line>
  )
}

export function CheckIcon(p: SvgProps) {
  return (
    <Line {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Line>
  )
}
