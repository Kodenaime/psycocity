import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalTeardown: "./tests/e2e/teardown.ts",
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: 'npm run db:indexes && npx --no-install concurrently --kill-others "npm start" "npm run worker:mail"',
    url: "http://127.0.0.1:3101/api/v1/ready",
    env: { NODE_ENV: "test", SERVE_WEB: "true", APP_ORIGIN: "http://127.0.0.1:3101", EMAIL_TRANSPORT: "local", PAYSTACK_SECRET_KEY: "", PORT: "3101", MONGODB_URI: process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27018/psycocity_test?replicaSet=rs0&directConnection=true" },
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
