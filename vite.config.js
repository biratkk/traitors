import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'The Traitors Dashboard',
        short_name: 'Traitors',
        description: 'A host dashboard for a Traitors-style party game.',
        theme_color: '#151820',
        background_color: '#151820',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.includes('/sounds/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'traitors-sounds',
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
})
