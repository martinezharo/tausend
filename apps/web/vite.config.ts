import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tausend — German',
        short_name: 'Tausend',
        description: 'The 1000 most frequent German words, in the order that unlocks real sentences fastest.',
        lang: 'en',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#E2E0D9',
        theme_color: '#1B4FD8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // The whole course — including every pronunciation clip — is a couple
        // of megabytes, so precache the lot. A session started underground has
        // to work exactly like any other, and audio is not optional here.
        globPatterns: ['**/*.{js,css,html,woff2,json,svg,png,m4a}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      devOptions: { enabled: false }
    })
  ],
  server: { port: 5273 },
  preview: { port: 5274 }
});
