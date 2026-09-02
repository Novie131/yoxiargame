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
