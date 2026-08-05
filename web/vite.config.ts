import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this project from /plate/, not the domain root, so
// asset URLs need that prefix or every request 404s. Local dev and
// `npm run preview` stay at the root, hence the env switch — set
// PAGES_BASE in CI only.
const base = process.env.PAGES_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // injectManifest keeps our own fetch logic (network-first navigation)
      // rather than reconstructing it from Workbox config options.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        // The ZXing binary is ~1.2MB and must be precached for offline
        // scanning, so raise the default 2MB-per-file ceiling headroom.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,png,svg,wasm}']
      },
      manifest: {
        name: 'Plate — Contador de calorías',
        short_name: 'Plate',
        description: 'Registra tus comidas, tu peso y tus entrenamientos.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAFAFB',
        theme_color: '#FAFAFB',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      devOptions: {
        // Keeps `npm run dev` free of service-worker caching surprises.
        enabled: false
      }
    })
  ]
})
