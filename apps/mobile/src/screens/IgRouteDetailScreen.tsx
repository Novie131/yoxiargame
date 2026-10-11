import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { ChevronLeftIcon } from '@/components/icons'
import { FALLBACK_LABEL, useUserLocation } from '@/lib/location'
import { formatFare, useRideEstimate } from '@/lib/ride'
import { WALK_ROUTE } from '@/lib/walkRoute'

/*
 * 對應設計稿 frame：IG 路線詳情（Figma 475:88）
 *
 * 探索頁裡一則 IG 風格的散步路線貼文。tab bar 的「探索」亮著，所以它屬於探索分頁；
 * 入口是探索頁的「今日旅行推薦」與 Agent 的散步路線卡（路線資料在 lib/walkRoute）。
 *
 * 貼文內容（照片、標題、hashtag、1.8 公里 / 45 分鐘 / 5 個景點、按讚數）是**示範貼文**，
 * 照設計稿寫死；底下的「從我的位置出發」與 yoxi 車程／車資則是真的：
 * 起點是使用者目前位置，車資用估價頁同一支估算 —— 設計稿寫的 NT$210 / 22 分鐘拿掉了，
 * 留著的話按下「開始探索」進估價頁會看到另一個數字。
 *
 * 跟設計稿不同的地方：
 *   照片只有一張（從設計稿裁出來的），所以拿掉輪播的五顆點
 *   留言鈕拿掉了 —— 沒有留言功能，放一顆按了沒反應的鈕比不放更糟
 *   左上多一顆返回鈕：設計稿沒有，但這頁是從別處點進來的，沒有它只能靠 tab bar 回去
 */

const POST = WALK_ROUTE
const START = WALK_ROUTE.start

export function IgRouteDetailScreen() {
  const navigate = useNavigate()
  const { key: historyKey } = useLocation()
  const location = useUserLocation()

  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const hereLabel = location.label ?? (location.precise ? '目前位置' : `${FALLBACK_LABEL}（預設位置）`)
  /* 估價 hook 把座標放進 effect 相依，用數值記住同一個物件，避免每次 render 重打 */
  const here = useMemo(() => ({ lat: location.lat, lon: location.lon }), [location.lat, location.lon])
  const start = useMemo(() => ({ lat: START.lat, lon: START.lon }), [])
  const estimate = useRideEstimate(here, start)

  const flash = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), 1800)
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: POST.title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      flash('已複製連結')
    } catch {
      /* 使用者取消分享面板也會丟例外，不算錯誤 */
    }
  }

  const toggleSave = () => {
    setSaved((s) => !s)
    flash(saved ? '已取消收藏' : '已收藏到我的路線')
  }

  /* 叫車到路線起點：上車點不帶，估價頁會用目前位置 —— 跟這頁估的是同一段 */
  const startExploring = () =>
    navigate(
      `/ride/estimate?${new URLSearchParams({
        to: START.label,
        toLat: String(START.lat),
        toLon: String(START.lon),
      })}`,
    )

  return (
    <div className="relative flex-1 bg-surface-2">
      <div className="relative bg-surface">
        <img
          src={POST.image}
          alt="溫州街巷弄裡的日式老屋"
          className="aspect-[462/438] w-full object-cover"
        />
        <button
          type="button"
          aria-label="返回"
          /* 直接貼網址進來時沒有上一頁（key 為 default），退回探索 */
          onClick={() => (historyKey !== 'default' ? navigate(-1) : navigate('/explore'))}
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <section className="bg-surface px-4 pb-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="-ml-2 flex items-center">
            <IconButton label={liked ? '取消讚' : '按讚'} pressed={liked} onClick={() => setLiked((v) => !v)}>
              <HeartIcon filled={liked} />
            </IconButton>
            <IconButton label="分享" onClick={() => void share()}>
              <ShareIcon />
            </IconButton>
          </div>
          <IconButton label={saved ? '取消收藏' : '收藏'} pressed={saved} onClick={toggleSave} className="-mr-2">
            <BookmarkIcon filled={saved} />
          </IconButton>
        </div>

        <p className="text-[14px] font-bold">{(POST.likes + (liked ? 1 : 0)).toLocaleString('en-US')} 個讚</p>
        <h1 className="mt-1 text-[22px] font-bold leading-snug">{POST.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[14px] font-bold text-primary">
          {POST.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
        <p className={`mt-2 text-[15px] leading-[1.7] text-ink-2 ${expanded ? '' : 'line-clamp-4'}`}>
          {POST.body}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-9 text-[14px] text-subtle"
        >
          {expanded ? '收起' : '…更多'}
        </button>
      </section>

      <div className="px-4 py-4">
        <div className="rounded-[20px] border border-black/[.06] bg-surface p-4 shadow-[0_2px_10px_rgba(22,32,55,.05)]">
          <p className="text-[12px] text-subtle">路線起點</p>
          <p className="mt-1 flex items-start gap-1.5 text-[15px] font-bold">
            <span aria-hidden>📍</span>
            <span>
              {START.label}（{START.note}）
            </span>
          </p>

          <div className="mt-3 flex justify-between gap-2 border-y border-black/[.06] py-3 text-[14px] font-bold">
            <span className="whitespace-nowrap">📏 {POST.distanceKm} 公里</span>
            <span className="whitespace-nowrap">⏱ 約 {POST.minutes} 分鐘</span>
            <span className="whitespace-nowrap">📍 {POST.spots} 個景點</span>
          </div>

          <p className="mt-3 text-[12px] text-subtle">從我的位置出發</p>
          <p className="mt-1 flex items-start gap-1.5 text-[15px] font-bold">
            <span aria-hidden>📌</span>
            <span className="min-w-0 break-words">{hereLabel}</span>
          </p>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary-muted/70 bg-primary-tint-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-primary">yoxi 預估車程</p>
              <p className="text-[13px] text-muted">
                {estimate.status === 'ready'
                  ? `約 ${estimate.data.durationMinutes} 分鐘・${estimate.data.distanceKm} 公里`
                  : estimate.status === 'error'
                    ? '估價暫時取不到'
                    : '估算中…'}
              </p>
            </div>
            <p className="shrink-0 text-[20px] font-bold text-primary">
              {estimate.status === 'ready' ? formatFare(estimate.data.fare) : '—'}
            </p>
          </div>

          <button
            type="button"
            onClick={startExploring}
            className="mt-4 w-full rounded-full bg-primary py-3.5 text-[16px] font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-[.98]"
          >
            開始探索
          </button>
          <p className="mt-2 text-center text-[11px] text-subtle">
            先叫 yoxi 到路線起點；下一步確認車資，不會直接叫車。車資依公告費率估算。
          </p>
        </div>
      </div>

      {toast && (
        <p
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-24 mx-auto w-max max-w-[80%] rounded-full bg-ink/90 px-4 py-2 text-[13px] text-white"
        >
          {toast}
        </p>
      )}
    </div>
  )
}

function IconButton({
  label,
  pressed,
  onClick,
  className = '',
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full active:bg-surface-3 ${className}`}
    >
      {children}
    </button>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill={filled ? 'var(--color-primary)' : 'none'} aria-hidden>
      <path
        d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"
        stroke="var(--color-primary)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
      <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden>
      <path
        d="M6 3.5h12v17l-6-4-6 4v-17Z"
        stroke="var(--color-ink)"
        fill={filled ? 'var(--color-ink)' : 'none'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {!filled && <path d="M12 7.5v6M9 10.5h6" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}
