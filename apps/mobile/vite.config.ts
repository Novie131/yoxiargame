import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
