import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
    viewport: {
      width: 1280,
      height: 720
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
