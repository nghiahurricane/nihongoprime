import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['app-logo-cropped.png'],
      manifest: {
        short_name: 'Nihongo Prime',
        name: 'Nihongo Prime',
        description: 'Nihongo Prime',
        icons: [
          {
            src: '/app-logo-cropped.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/app-logo-cropped.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        start_url: '.',
        display: 'standalone',
        theme_color: '#0F172A',
        background_color: '#07111F'
      }
    })
  ],
})
