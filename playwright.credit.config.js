// @ts-check
/** 信用卡 E2E 專用設定（可選） */
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/ecpay-checkout.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    headless: process.env.E2E_HEADED === '1' ? false : true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
