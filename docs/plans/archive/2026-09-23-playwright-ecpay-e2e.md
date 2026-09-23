# Playwright 綠界刷卡 E2E

## User Story

As a 開發者, I want 用 Playwright 跑完整「加購 → 結帳 → 綠界測試刷卡 → 訂單已付款」流程, so that 可驗證本機 AIO 金流與前端導回／confirm 主路徑真的能結帳成功。

## Spec

- 使用 `@playwright/test`，對 `http://localhost:3001`（既有 `npm start`）做瀏覽器 E2E。
- 流程：註冊新使用者 → 有庫存商品加入購物車 → 結帳填收件 → 建立訂單 →「前往付款」→ 綠界 staging 測試卡 `4311-9522-2222-2222`（CVV 任意、效期未來、3DS `1234`）→ 導回後確認狀態為已付款／付款成功。
- 測試打真實綠界 staging，不 mock `QueryTradeInfo`；需網路。
- 與既有 Vitest API 測試分離（`e2e/`），不加入 `vitest.config.js` sequence。

## Tasks

- [x] 安裝 `@playwright/test`、Chromium
- [x] `playwright.config.js` + `npm run test:e2e`
- [x] `e2e/ecpay-checkout.spec.js` 完整刷卡成功斷言
- [x] 更新 `TESTING.md`／`CHANGELOG.md`／`FEATURES.md`；計畫歸檔
