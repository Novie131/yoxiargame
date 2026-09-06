import type { ReactNode } from 'react'

import { useMember } from '@/lib/member'

/* 對話氣泡。助理訊息無底色、時間戳在氣泡外；使用者訊息是主色底、時間戳在氣泡內 */

export function Avatar({
  emoji,
  src,
  ring,
  alt = '',
}: {
  emoji?: string
  /* 有圖就用圖（會員頭貼），沒有才退回 emoji */
  src?: string
  ring?: string
  alt?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        style={{ background: ring ?? 'var(--color-surface-3)' }}
      />
    )
  }

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px]"
      style={{ background: ring ?? 'var(--color-surface-3)' }}
    >
      {emoji}
    </span>
  )
}

/*
 * 等回覆時的三顆點。
 *
 * 取代原本的「思考中...」：那三個字會跟串流回來的第一段文字打架 ——
 * 字一出現它就消失，看起來像閃了一下。點點是純視覺的，換掉時不會有文字跳動。
 */
export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" role="status" aria-label="思考中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="thinking-dot block h-1.5 w-1.5 rounded-full bg-subtle"
          /* 依序錯開，才是波浪而不是三顆一起跳 */
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  )
}

export function AssistantMessage({
  avatar = '🦎',
  time,
  card,
  children,
}: {
  avatar?: string
  time?: string
  /* 情境變體的稿裡，助理訊息是包在白卡片內；一般首頁則直接放在底色上 */
  card?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Avatar emoji={avatar} ring="var(--color-warning-tint)" />
      <div
        className={
          card
            ? 'min-w-0 flex-1 rounded-2xl bg-surface px-4 py-3.5 shadow-[0_1px_6px_rgba(22,32,55,.05)]'
            : 'min-w-0 flex-1'
        }
      >
        <div className="text-[15px] leading-[1.7]">{children}</div>
        {time && <p className="mt-2 text-[11px] text-subtle">{time}</p>}
      </div>
    </div>
  )
}

export function UserMessage({
  avatar,
  time,
  children,
}: {
  /* 不傳就用目前會員的頭貼；設計稿還原的畫面可以傳 emoji 蓋掉 */
  avatar?: string
  time?: string
  children: ReactNode
}) {
  const { avatarUrl, displayName } = useMember()
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[78%] rounded-2xl bg-primary px-4 py-3 text-[15px] leading-[1.7] text-white">
        {children}
        {time && <p className="mt-1.5 text-[11px] text-white/75">{time}</p>}
      </div>
      {avatar ? (
        <Avatar emoji={avatar} ring="var(--color-ink)" />
      ) : (
        <Avatar src={avatarUrl} alt={displayName} ring="var(--color-ink)" />
      )}
    </div>
  )
}
