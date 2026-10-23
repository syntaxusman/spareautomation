import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Stateful CMS scenarios share one staging database. Serial CI execution
  // prevents cross-test publishing, session and seed races.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "unit",
      testMatch: /unit\/.*\.spec\.ts/,
    },
    {
      name: "desktop-chromium",
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], browserName: "chromium" },
    },
    {
      name: "mobile-chromium",
      testMatch: /e2e\/.*\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
