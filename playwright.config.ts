import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke coverage for a real practice session — the one part of the
 * app that unit tests cannot reach, because it only exists once IndexedDB,
 * the scheduler and the DOM are all running together.
 *
 * No browsers are downloaded: point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at a
 * Chromium already on the machine. This is a VPS-portable arrangement, and it
 * keeps a 150 MB download out of every checkout.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5275',
    // A phone is where this app is actually used.
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  },
  webServer: {
    command: 'pnpm --filter @tausend/web preview --host 127.0.0.1 --port 5275',
    url: 'http://127.0.0.1:5275',
    reuseExistingServer: !process.env.CI
  }
});
