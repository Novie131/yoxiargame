import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
     * PWA。index.html 原本就有 manifest 與 iOS 的那幾個標籤，「加入主畫面」
     * 已經能用；缺的是 service worker —— 沒有它就沒有離線能力，
     * Android Chrome 也不會跳安裝提示（它把 SW 列為可安裝的條件之一）。
     */
    VitePWA({
      /*
       * manifest 維持 public/manifest.webmanifest 那份手寫的，不要讓外掛產生。
       * 兩邊都有的話會出現兩個 manifest、兩個 <link>，而 iOS 只讀 index.html 裡
       * 先出現的那個，很難察覺是哪一份在生效。
       */
      manifest: false,
      /*
       * 註冊的程式碼自己寫（見 src/main.tsx）——
       * 外掛預設注入的那段沒有條件判斷，會在 Capacitor 的原生殼裡也跑。
       * 原生殼是 capacitor:// 這個 scheme，不支援 service worker，
       * 註冊只會丟出例外，而且那裡本來就沒有離線問題（檔案都在 App 裡）。
       */
      injectRegister: null,
      registerType: 'autoUpdate',
      workbox: {
        /*
         * 預先快取只放「開起來就要用到」的東西。
         *
         * maplibre 那兩包（主程式 1MB、worker 486KB）刻意排除 ——
         * 它們佔了整包的四分之三，但只有開到地圖的畫面才需要。
         * 全部預先快取的話，第一次載入要多下載 1.5MB，
         * 而多數人可能根本沒點進地圖。改由下面的 runtimeCaching 接手：
         * 第一次開地圖時下載並存起來，之後就能離線用。
         */
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/maplibre-gl*'],
        /*
         * SPA 的路由都在前端（/explore、/ride/booking…），伺服器上沒有這些檔案。
         * 跟 public/_redirects 是同一件事，差別在這條是離線時由 SW 負責。
         */
        navigateFallback: '/index.html',
        /*
         * 後端在另一個網域（VITE_API_URL），本來就不會被 navigateFallback 接到，
         * 這裡擋的是同網域下未來可能出現的 /api 路徑。
         */
        navigateFallbackDenylist: [/^\/api\//],
        /* 改版後把舊版的快取清掉，不要留著佔空間 */
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            /*
             * 地圖的程式碼。第一次開地圖時下載，之後直接從快取拿 ——
             * 檔名帶 hash，改版一定是新的網址，所以 CacheFirst 不會拿到舊的。
             */
            urlPattern: /\/assets\/maplibre-gl.*\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maplibre-lib',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            /*
             * 地圖樣式與字型（sprite、glyphs）。內容會更新但不常，
             * 用 StaleWhileRevalidate：先給快取的版本讓地圖立刻能畫，
             * 同時在背景抓新的給下一次用。
             */
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(?:styles|fonts|sprites)\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-style',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * 圖磚。數量很大所以要限量 —— 只留最近看過的 400 張，
             * 大約是幾個熟悉區域來回縮放的量，超過就淘汰最舊的。
             * 沒有這個上限的話，逛久了會在使用者手機上累積數百 MB。
             */
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /*
   * MapLibre 的 worker 是 ES module（它用 new Worker(url, { type: 'module' }) 建立），
   * Vite build 預設會把 worker 打成 iife，那樣載不起來。
   */
  worker: { format: 'es' },
  server: {
    host: true, // 讓手機連同一個 Wi-Fi 就能開，也給 Capacitor live reload 用
  },
})
