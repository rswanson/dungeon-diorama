import { defineConfig, devices } from "@playwright/test";

// The end-to-end tests run against the built server and a real Postgres. Run
// `npm run build` and `npm run db:up` first.
const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: BASE,
    // A failed test leaves its trace and screenshot in test-results/, which CI uploads.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Headless Chromium has no GPU. SwiftShader draws WebGL in software.
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "node dist/server/index.js",
    url: `${BASE}/healthz`,
    // Without DATABASE_URL (CI sets it), the server uses the `npm run db:up` database.
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
