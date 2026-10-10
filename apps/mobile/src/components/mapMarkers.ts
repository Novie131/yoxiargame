/*
 * 叫車流程地圖上的標記外觀。
 *
 * MapLibre 的自訂標記要的是一個 DOM 元素，不是 React 元件，
 * 所以這裡用字串組 —— 數量很少（最多四、五個），不值得為此掛一個 React root。
 *
 * 顏色一律用 index.css 的 @theme token（var(--color-…)），不寫色碼：
 * 品牌色哪天換了，地圖上的標記要跟著換。
 *
 * 每個元素的外框就是那個圓本身，說明文字用 absolute 掛在圓的下方 ——
 * 這樣 MapLibre 以 center 錨定時，座標會正好落在圓心，不會被文字的高度拉偏。
 */

export type MarkerVariant =
  /** 上車點／目前位置：主色圓點加光暈（設計稿 yoxi-booking、trip-in-progress） */
  | 'dot'
  /** 起點：深色圓底加人形（設計稿 yoxi-ride-estimate 的「我的位置」） */
  | 'origin'
  /** 終點：主色圓底加旗子（設計稿 yoxi-ride-estimate 的「松山機場」） */
  | 'destination'
  /** 行程中的目的地：大的主色實心圓（設計稿 yoxi-trip-in-progress 的「台北101」） */
  | 'goal'
  /** 車輛：白底圓加計程車圖示（設計稿 yoxi-booking 的附近車輛、司機位置） */
  | 'car'

const SHADOW = 'box-shadow:0 2px 8px rgba(22,32,55,.28)'

/* 使用者輸入的地名會進到 innerHTML 旁邊，一律走 textContent，不要拼進字串 */
function caption(text: string, tone: 'ink' | 'primary' | 'plain'): HTMLElement {
  const el = document.createElement('span')
  el.textContent = text
  const look =
    tone === 'plain'
      ? 'color:var(--color-primary);font-weight:700;text-shadow:0 0 3px var(--color-surface),0 0 3px var(--color-surface)'
      : `color:var(--color-surface);background:var(--color-${tone});padding:2px 7px;border-radius:6px;font-weight:600;${SHADOW}`
  el.style.cssText = [
    'position:absolute', 'top:calc(100% + 4px)', 'left:50%', 'transform:translateX(-50%)',
    'max-width:128px', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
    'font-size:11px', 'line-height:16px', 'pointer-events:none',
    look,
  ].join(';')
  return el
}

function circle(size: number, background: string, border: string, icon = ''): HTMLElement {
  const el = document.createElement('div')
  /*
   * 不要在這裡設 position —— MapLibre 靠 .maplibregl-marker 的 position:absolute
   * 把每個標記疊在左上角再用 transform 移過去。行內寫 relative 會蓋掉它，
   * 標記就變成一般排版、一個接一個往下排，第二個之後全部偏移一個標記的高度（踩過）。
   * 下方地名的 absolute 定位靠的也是那個 absolute。
   */
  el.style.cssText = [
    `width:${size}px`, `height:${size}px`, 'border-radius:9999px',
    'display:flex', 'align-items:center', 'justify-content:center',
    `background:${background}`, `border:${border}`, SHADOW,
  ].join(';')
  el.innerHTML = icon
  return el
}

const PERSON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
  <circle cx="12" cy="8" r="3.5" stroke="var(--color-surface)" stroke-width="2"/>
  <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" stroke="var(--color-surface)" stroke-width="2" stroke-linecap="round"/>
</svg>`

const FLAG_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
  <path d="M6 21V4m0 0h10l-2 4 2 4H6" stroke="var(--color-surface)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`

/* 跟 components/icons.tsx 的 TaxiIcon 同一個圖形 */
const TAXI_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
  <path d="M9 3.5h6v2H9z" fill="var(--color-primary)"/>
  <path d="M3 15v-2.2L5 8h14l2 4.8V15m-18 0h18m-18 0v2h3v-2m15 0v2h-3v-2" stroke="var(--color-primary)" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`

export function markerElement(variant: MarkerVariant, label?: string): HTMLElement {
  let el: HTMLElement
  switch (variant) {
    case 'dot':
      el = circle(16, 'var(--color-primary)', '3px solid var(--color-surface)')
      /* 光暈用 color-mix 從主色調出來，不另外定一個半透明色 */
      el.style.boxShadow =
        '0 0 0 9px color-mix(in srgb, var(--color-primary) 22%, transparent), 0 1px 4px rgba(22,32,55,.35)'
      break
    case 'origin':
      el = circle(36, 'var(--color-ink)', '2px solid var(--color-surface)', PERSON_ICON)
      break
    case 'destination':
      el = circle(36, 'var(--color-primary)', '2px solid var(--color-surface)', FLAG_ICON)
      break
    case 'goal':
      el = circle(30, 'var(--color-primary)', '3px solid var(--color-surface)')
      break
    case 'car':
      el = circle(34, 'var(--color-surface)', '1.5px solid var(--color-primary)', TAXI_ICON)
      break
  }

  if (label) {
    el.setAttribute('aria-label', label)
    const tone = variant === 'origin' ? 'ink' : variant === 'destination' ? 'primary' : 'plain'
    el.appendChild(caption(label, tone))
  }
  return el
}

/*
 * MapLibre 的線圖層不吃 CSS 變數，要給實際的色值。
 * 從 :root 讀 @theme 定義的那個 token，讀不到（理論上不會）才用主色的字面值。
 */
export function tokenColor(name: string, fallback: string): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
  } catch {
    return fallback
  }
}
