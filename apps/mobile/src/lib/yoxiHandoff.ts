/*
 * 交棒給真正的 yoxi App。
 *
 * ── 為什麼是交棒而不是串接 ──
 * 這個原型的派車、司機、倒數全是模擬的（見 lib/ride.ts），接真的派車需要
 * yoxi 的 API 合作。在那之前，讓使用者按完「叫車」卻拿不到車，是整個
 * 流程裡唯一會真正害到他的地方。
 *
 * 所以分工改成：**我們負責決定，yoxi 負責派車。**
 * 比較走路／捷運／叫車、估車資、判斷值不值得——那些是這個 App 的價值，
 * 而且都已經是真的。最後那一步交給有車的人。
 *
 * ── 這個網址是查證過的，不是猜的 ──
 * https://www.yoxi.app/.well-known/apple-app-site-association
 *   把 /appInfo/passenger 與 /appInfo/passenger/* 註冊給 tw.com.yoxi.rider
 * https://www.yoxi.app/.well-known/assetlinks.json
 *   把同一個網域委派給同一個 Android package
 *
 * 所以「裝了就開 App、沒裝就去下載」這件事**由作業系統處理**，我們不用自己
 * 偵測有沒有安裝（那件事在瀏覽器裡本來就做不可靠）。沒裝的人會落在那一頁，
 * 而那一頁本身就是官方下載頁。
 *
 * 絕對不要改成猜一個 `yoxi://` scheme —— 猜錯的後果是按了完全沒反應，
 * 比現在的模擬流程更糟：至少模擬流程還有標示說它是模擬的。
 */

/**
 * yoxi 乘客端的官方 universal link（同時是沒安裝時的下載頁）。
 *
 * 對外開放是因為它必須被放進真正的 <a href>，不能靠 JS 開 —— 見下面。
 */
export const YOXI_PASSENGER_LINK = 'https://www.yoxi.app/appInfo/passenger'

/*
 * 帶不了上下車地點。
 *
 * yoxi 沒有公開 deep link 參數，硬塞 query string 只會被忽略。
 * 所以目的地改用剪貼簿交棒 —— 土法煉鋼，但它是誠實的，而且真的省事：
 * 使用者在 yoxi 的搜尋框長按貼上就好，不用重打一次地址。
 *
 * 之後若拿到官方參數，只要改這個檔案，呼叫端一行都不用動。
 */
/*
 * 注意：**呼叫端不要 await 這個函式**再去開連結。
 *
 * await 會把後續動作推到下一個 tick，那時候使用者手勢已經結束，
 * 瀏覽器會把開啟連結當成彈窗擋掉（實機踩過）。
 * 它回傳 Promise 只是為了讓畫面能顯示「已複製」，不是流程的前置條件。
 *
 * 另外它需要 secure context：用手機連 http://192.168.x.x:5173 測的時候
 * 一定會失敗，那不是程式壞了。正式環境是 https 就沒這個問題。
 */
export function copyDestination(label: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return Promise.resolve(false)
    return navigator.clipboard.writeText(label).then(
      () => true,
      /* 使用者拒絕剪貼簿權限、或瀏覽器擋下 —— 不是錯誤，只是少一個便利 */
      () => false,
    )
  } catch {
    return Promise.resolve(false)
  }
}

/*
 * ── 為什麼沒有 openYoxiApp() 這種函式 ──
 *
 * 一開始是寫成 `window.open(...)`，實機測試打不開 App。兩個原因，都是硬性的：
 *
 * 1. **手勢被 await 打斷。** 先 `await` 複製剪貼簿再 window.open，那一刻已經
 *    不在使用者手勢的同一個 tick 裡了，行動瀏覽器會當成彈窗擋掉。
 *
 * 2. **universal link 對 window.open 不可靠。** iOS 只保證「使用者真的點了
 *    一個 <a href>」時才會把網址交給 App 處理；用 JS 開的，Safari 常常
 *    直接在瀏覽器裡把那一頁打開，看起來就是「沒有跳轉」。
 *
 * 所以正確做法是**讓它就是一個 <a>**，由使用者直接點。剪貼簿那邊改成
 * 不 await 的 fire-and-forget，才不會卡在瀏覽器與 App 中間。
 *
 * 呼叫端請用 YOXI_PASSENGER_LINK 搭配真正的 <a>，不要再包一層 JS。
 */
