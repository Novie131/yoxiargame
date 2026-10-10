import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

/*
 * 卡片右上角的「•••」選單。
 *
 * 設計稿上常用路線卡與行程卡都只有這三個點，次要動作（修改、改日期、移除）
 * 收在裡面，讓卡片本身只留一顆主要 CTA。
 *
 * 照 WAI-ARIA 的 menu button 模式做：開啟時焦點移到第一項、上下鍵移動、
 * Esc 關閉並把焦點還給按鈕 —— 用鍵盤或螢幕閱讀器的人才不會卡在選單裡。
 */

export type MenuItem = {
  label: string
  onSelect: () => void
  /** 移除這類動作用主色提醒，不另外造新色 */
  danger?: boolean
}

export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  /* 點選單外面就關掉。用 pointerdown 而不是 click，才不會跟開啟那一下打架。 */
  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = itemRefs.current.findIndex((el) => el === document.activeElement)
    const last = items.length - 1
    let next: number | null = null
    if (e.key === 'ArrowDown') next = index >= last ? 0 : index + 1
    else if (e.key === 'ArrowUp') next = index <= 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    } else if (e.key === 'Tab') {
      setOpen(false)
      return
    }
    if (next !== null) {
      e.preventDefault()
      itemRefs.current[next]?.focus()
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="-mr-2 flex h-11 w-11 items-center justify-center gap-1 rounded-full"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-subtle" />
        ))}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl bg-surface py-1 shadow-[0_8px_24px_rgba(22,32,55,.16)] ring-1 ring-black/5"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex min-h-11 w-full items-center px-4 text-left text-[14px] focus:bg-surface-3 focus:outline-none active:bg-surface-3 ${
                item.danger ? 'text-primary' : 'text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
