import { useState } from 'react'

import { KeyboardIcon, MicIcon } from './icons'

/*
 * 首頁底部的輸入列。
 * 沒有傳 onSend 時就是純展示（設計稿還原用），有傳才會真的送出。
 */
export function ChatComposer({
  placeholder = '說些什麼...',
  onSend,
  disabled,
}: {
  placeholder?: string
  onSend?: (text: string) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const readOnly = !onSend

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text || disabled) return
    onSend?.(text)
    setValue('')
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-3 border-t border-black/5 px-4 py-3"
    >
      <KeyboardIcon />
      <input
        value={readOnly ? '' : value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        className="h-11 flex-1 rounded-full bg-surface-3 px-4 text-[15px] outline-none placeholder:text-subtle disabled:opacity-60"
        placeholder={disabled ? '回覆中...' : placeholder}
      />
      <button
        type="submit"
        aria-label={readOnly ? '語音輸入' : '送出'}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        <MicIcon />
      </button>
    </form>
  )
}
