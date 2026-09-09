import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

/*
 * Service worker。只在瀏覽器裡註冊。
 *
 * Capacitor 的原生殼用 capacitor:// 這個 scheme，不支援 service worker，
 * 註冊會直接丟例外；而且那裡本來就沒有離線問題 —— 網頁檔案是打包進 App 的，
 * 飛航模式下照樣開得起來。所以原生殼完全不需要它。
 *
 * 動態 import 是為了讓這段連同 virtual:pwa-register 一起被切成獨立 chunk，
 * 原生殼不會下載到。
 */
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })

  /*
   * 換版後重新整理一次。
   *
   * skipWaiting 讓新的 SW 立刻接管，但頁面上跑的還是舊版的 JS ——
   * 之後若要動態載入某個 chunk（例如第一次點開地圖），舊的檔名可能已經
   * 隨著部署消失，那個 import 就會失敗。重新整理一次可以避開。
   *
   * controller 原本是 null 代表這是「第一次安裝」而不是換版，那時不能重整
   * ——會變成每個新訪客一進來就被重新整理一次。
   */
  let reloading = false
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
}
