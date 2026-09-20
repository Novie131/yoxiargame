/*
 * 版面上「誰要讓開誰」的共用知識。
 *
 * 會需要這個檔案，是因為 tab bar 中央那顆鈕是**浮出來的**：
 * 它比 tab bar 高一截，會壓在上方內容的底部正中央。
 * 貼著 tab bar 的元件（叫車流程的底部面板）得自己讓開那一塊，
 * 否則 CTA 按鈕正中央會被蓋住 —— 而那正是使用者要按的地方。
 *
 * 值寫在這裡而不是各自硬幹，是因為它同時被 AppShell（決定要不要畫 tab bar）
 * 與 BottomSheet（決定要留多少底部空間）讀到。兩邊各記一份的話，
 * 之後改了按鈕大小就會有一邊忘記跟上。
 */

/* 這些設計稿是全螢幕流程，沒有 tab bar */
const routesWithoutTabBar = new Set(['/ride/estimate'])

/** 這個路徑底下有沒有 tab bar（連帶決定有沒有那顆浮出來的中央鈕） */
export function hasTabBar(pathname: string): boolean {
  return !routesWithoutTabBar.has(pathname)
}

/*
 * 中央鈕突出於 tab bar 上緣的高度。
 * 必須跟 TabBar 的 `-top-4`（1rem = 16px）對得起來。
 */
export const CENTER_BUTTON_OVERHANG_PX = 16
