import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

function deployedCommit() {
  const configuredCommit = process.env.VITE_GIT_COMMIT?.trim();
  if (configuredCommit) return configuredCommit.slice(0, 8);

  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(deployedCommit())
  },
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
        // Word recordings are the hot path of a drill and small enough to
        // precache. The synthesised sentence and letter clips are three times
        // as many files for audio a learner meets far less often, so they are
        // fetched when first played and kept from then on.
        globPatterns: ['**/*.{js,css,html,woff2,json,svg,png,m4a}'],
        globIgnores: ['**/audio/*/tts/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/audio\/[^/]+\/tts\/.*\.m4a$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tausend-tts',
              expiration: { maxEntries: 600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: { port: 5273 },
  preview: { port: 5274 }
});
