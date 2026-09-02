import { useState } from 'react'

import { KeyboardIcon, MicIcon, SendIcon } from './icons'
import { useSpeechInput } from '@/lib/speech'

/*
 * 首頁底部的輸入列。
 * 沒有傳 onSend 時就是純展示（設計稿還原用），有傳才會真的送出。
 *
 * 右邊那顆鈕身兼兩職：有字就是送出，沒字就是語音輸入。
 * 語音辨識結果先填進輸入框讓使用者確認，不直接送出 —— 聽錯的時候
 * 直接送出去很惱人，而且改一個字比重講一次快。
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
  /* 邊說邊出現的暫時結果，還沒定案，不寫進 value */
  const [interim, setInterim] = useState('')
  const readOnly = !onSend

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text || disabled) return
    if (speech.listening) speech.stop()
    onSend?.(text)
    setValue('')
    setInterim('')
  }

  const hasText = value.trim().length > 0
  /* 沒字而且瀏覽器支援語音時，這顆鈕是麥克風；其餘情況都是送出 */
  const micMode = !readOnly && !hasText && speech.supported

  const shown = interim ? (value ? `${value} ${interim}` : interim) : value

  return (
    <div className="border-t border-black/5">
      {speech.error && (
        <p className="px-5 pt-2 text-[12px] text-primary" role="status">
          {speech.error}
        </p>
      )}

      <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3">
        <KeyboardIcon />

        <div className="relative flex-1">
          <input
            value={readOnly ? '' : shown}
            onChange={(e) => {
              setValue(e.target.value)
              setInterim('')
            }}
            readOnly={readOnly || speech.listening}
            disabled={disabled}
            className="h-11 w-full rounded-full bg-surface-3 px-4 text-[15px] outline-none placeholder:text-subtle disabled:opacity-60"
            placeholder={
              disabled ? '回覆中...' : speech.listening ? '聆聽中，請說話…' : placeholder
            }
          />
          {speech.listening && (
            <span className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
            </span>
          )}
        </div>

        <button
          type={micMode ? 'button' : 'submit'}
          aria-label={micMode ? (speech.listening ? '停止語音輸入' : '語音輸入') : '送出'}
          aria-pressed={micMode ? speech.listening : undefined}
          onClick={micMode ? speech.toggle : undefined}
          disabled={disabled || (!micMode && !hasText && !readOnly)}
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            'transition-transform active:scale-95 disabled:opacity-60',
            speech.listening ? 'bg-ink animate-pulse' : 'bg-primary',
          ].join(' ')}
        >
          {micMode || readOnly ? <MicIcon /> : <SendIcon />}
        </button>
      </form>
    </div>
  )
}
