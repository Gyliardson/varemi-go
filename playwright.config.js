import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "mkdir -p .var && rm -f .var/e2e.db && VAREMI_DATABASE_PATH=.var/e2e.db python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run web:dev",
      url: "http://127.0.0.1:5173/#/store/demo-market",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
