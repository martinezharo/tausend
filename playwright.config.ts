import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5275",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "pnpm --filter @tausend/web preview --host 127.0.0.1 --port 5275",
    url: "http://127.0.0.1:5275",
    reuseExistingServer: !process.env.CI,
  },
});
