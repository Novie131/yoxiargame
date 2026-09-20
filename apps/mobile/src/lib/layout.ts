/*
 * 版面上「誰要讓開誰」的共用知識。
 *
 * 目前只有一件事：哪些路徑底下有 tab bar。AppShell 用它決定要不要畫，
 * 之後若有別的元件需要知道（例如固定在底部的浮層），從這裡拿，
 * 不要各自再列一份路徑清單 —— 兩份清單遲早會不一致。
 *
 * 注意：中央那顆浮出來的鈕**不需要別人讓開**，TabBar 自己保留了它的高度
 * （見 TabBar 的 pt-4）。這裡曾經有一個給呼叫端算下邊距用的常數，
 * 那是逐頁補救的做法，已經移除。
 */

/* 這些設計稿是全螢幕流程，沒有 tab bar */
const routesWithoutTabBar = new Set(['/ride/estimate'])

/** 這個路徑底下有沒有 tab bar */
export function hasTabBar(pathname: string): boolean {
  return !routesWithoutTabBar.has(pathname)
}
