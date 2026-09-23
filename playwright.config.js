// @ts-check
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');

/**
 * 不啟動 webServer：請先自行 npm start / npm run dev:server。
 * 預設只跑 WebATM 主流程；信用卡舊案可用 npm run test:e2e:credit。
 */
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/ecpay-webatm.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    headless: process.env.E2E_HEADED === '1' ? false : true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 若沙箱／CI 需系統 Chrome：E2E_CHANNEL=chrome npm run test:e2e
        ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
      },
    },
  ],
});
