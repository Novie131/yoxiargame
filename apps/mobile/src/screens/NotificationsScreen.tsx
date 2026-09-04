import { useNavigate } from 'react-router'

import { AlertIcon, BellIcon, ChevronLeftIcon } from '@/components/icons'
import { markRead, useNotifications, type AppNotification } from '@/lib/notifications'

/*
 * 通知收件匣 —— 設計稿未提供，這是依現有設計系統做的提案版。
 *
 * 內容全部來自後端的交通監看（services/transit-watch.ts），沒有任何示範資料：
 * 沒有事件就是空的，那是正確的狀態，不是畫面壞了。
 *
 * 每一則的重點是最後那顆動作鈕。通知的價值不在「告訴你捷運壞了」，
 * 在「接下來怎麼辦」—— 所以捷運異常的通知會直接帶你去叫車，
 * 起訖站是你自己設的通勤路線。
 */

/* 相對時間。通知的時間感是「多久以前」，不是「幾點幾分」。 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.floor(hours / 24)} 天前`
}

function NotificationCard({ notification }: { notification: AppNotification }) {
  const navigate = useNavigate()
  const { id, title, body, actionRoute, actionLabel, createdAt, read } = notification

  return (
    <article
      className="rounded-2xl bg-surface p-4 shadow-[0_1px_6px_rgba(22,32,55,.05)]"
      /* 讀過的沉下去，未讀的維持滿版對比 */
      style={read ? { opacity: 0.62 } : undefined}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-tint">
          <AlertIcon />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <span className="shrink-0 text-[11px] text-subtle">{relativeTime(createdAt)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-[1.7] text-muted">{body}</p>
        </div>

        {!read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
      </div>

      {actionRoute && (
        <button
          type="button"
          onClick={() => {
            /* 點了就是看過了 */
            void markRead(id)
            navigate(actionRoute)
          }}
          className="mt-3 w-full rounded-xl bg-primary py-3 text-[15px] font-semibold text-white transition-transform active:scale-[.98]"
        >
          {actionLabel ?? '查看'}
        </button>
      )}
    </article>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <BellIcon />
      </span>
      <p className="mt-3 text-[15px] font-semibold">目前沒有通知</p>
      <p className="mx-auto mt-1 max-w-[16rem] text-[13px] text-muted">
        你的通勤路線一切正常。捷運有事件通報時，這裡會第一時間出現提醒。
      </p>
    </div>
  )
}

export function NotificationsScreen() {
  const navigate = useNavigate()
  /* 停在這一頁時定時重抓，這是最可能等著看新通知的地方 */
  const { notifications, unreadCount, loading, error } = useNotifications(true)

  return (
    <div className="min-h-full bg-surface-2">
      <header className="flex items-center gap-2 bg-surface px-3 pb-4 pt-2">
        <button type="button" aria-label="返回" onClick={() => navigate(-1)} className="p-2">
          <ChevronLeftIcon />
        </button>
        <h1 className="flex-1 text-[20px] font-bold">通知</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markRead()}
            className="px-2 py-1 text-[13px] font-medium text-primary"
          >
            全部標為已讀
          </button>
        )}
      </header>

      <div className="space-y-3 px-4 py-4">
        {error && (
          <p className="rounded-xl bg-primary-tint px-4 py-3 text-[13px] text-primary">
            {error}
          </p>
        )}

        {notifications.map((n) => (
          <NotificationCard key={n.id} notification={n} />
        ))}

        {/* 載入中先不要下空狀態的結論，那會閃一下「沒有通知」 */}
        {notifications.length === 0 && !loading && !error && <EmptyState />}
      </div>
    </div>
  )
}
