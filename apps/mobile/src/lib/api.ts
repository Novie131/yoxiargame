import { Capacitor } from '@capacitor/core'

/* 後端位址。所有對 apps/api 的呼叫都從這裡取得 base URL。 */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/*
 * 打包進 App 之後，localhost 指的是使用者的手機自己，永遠連不到後端。
 * 這是很容易到了真機測試才發現的錯誤，所以在啟動時就明確警告。
 * 正式版必須設定 VITE_API_URL 為公開的 HTTPS 位址
 * （iOS 的 App Transport Security 預設會擋純 HTTP）。
 */
if (Capacitor.isNativePlatform() && /localhost|127\.0\.0\.1/.test(API_URL)) {
  console.error(
    `[api] VITE_API_URL 指向 ${API_URL}，在真機上連不到後端。` +
      '請在建置前設定 VITE_API_URL 為公開的 HTTPS 位址。',
  )
}
