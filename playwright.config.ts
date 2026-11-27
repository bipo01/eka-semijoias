import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Local-only test values (also in .dev.vars.example). */
export const E2E_PIN = '314159';
const E2E_PEPPER = 'e2e-local-pepper-0123456789abcdef0123456789abcdef';

export default defineConfig({
  testDir: './e2e',
  // One admin login per run (see e2e/admin-session.setup.ts).
  globalSetup: './e2e/admin-session.setup.ts',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Safari engine: iPhone emulation (touch, DPR 3, iOS user agent) and desktop Safari.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  // The real stack: the built SPA served by the Worker (wrangler dev) with a fresh local D1 and the
  // live Durable Object. Local-only secrets; the plain cookie name keeps WebKit happy over http.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: [
          'npm run build',
          'rm -rf .wrangler/e2e',
          'npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e',
          `npx wrangler dev --port ${PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e --var PIN_PEPPER:${E2E_PEPPER} --var ADMIN_INITIAL_PIN:${E2E_PIN} --var DEV_INSECURE_COOKIES:1 --var DEV_MEDIA_GRACE_MS:5000`,
        ].join(' && '),
        port: PORT,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
