/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Quản lý tiến độ thi công',
        short_name: 'Tiến độ',
        lang: 'vi',
        theme_color: '#1f5fa8',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
    }),
  ],
  build: { chunkSizeWarningLimit: 2500 },
  test: { environment: 'node' },
})
