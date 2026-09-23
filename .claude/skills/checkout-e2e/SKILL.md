---
name: checkout-e2e
description: >
  花卉電商 Playwright 結帳 E2E：加購 → 結帳 → 綠界 AIO staging 測試刷卡（含 3DS）→ 訂單已付款。
  Use when running or fixing checkout/payment E2E, ECPay credit-card Playwright tests,
  綠界刷卡自動化、結帳成功驗證、npm run test:e2e:ecpay, or when the user mentions checkout-e2e.
---

# Checkout E2E（綠界刷卡）

驗證本機「購物車 → 結帳 → 綠界 staging 信用卡 → 訂單已付款」是否真的通。

**成功標準**：訂單頁同時出現「付款成功！感謝您的購買。」與狀態「已付款」。

## 何時用

- 跑／修 `e2e/ecpay-checkout.spec.js`
- 金流或結帳 UI 改動後要確認 E2E
- 使用者說 checkout-e2e、綠界刷卡自動化、結帳 Playwright

## 前置（缺一不可）

1. Server 已聽 `http://localhost:3001`（`npm start` 或 `npm run dev:server`）
2. `.env`：`ECPAY_MERCHANT_ID`／`ECPAY_HASH_KEY`／`ECPAY_HASH_IV`、`ECPAY_ENV=staging`、`BASE_URL=http://localhost:3001`；登入帳密用 `ADMIN_EMAIL`／`ADMIN_PASSWORD`（seed admin）
3. 已裝 Playwright Chromium：`npx playwright install chromium`
4. 需能連外網（打 `payment-stage.ecpay.com.tw`）

## 快速執行

```bash
npm run test:e2e:ecpay
# 等同：npx playwright test e2e/ecpay-checkout.spec.js
```

優先**執行既有測試**，不要重寫。失敗再依下方流程除錯。

## 流程（已驗證）

```
登入（.env ADMIN_*）→ 選 stock>0 商品加購 → 購物車「前往結帳」→ 填收件 →「確認送出訂單」
  → 訂單「前往付款」→ 綠界 staging 填測試卡 → 處理對話框 → 3DS OTP 1234
  → 導回 /orders/:id → 前端自動 /ecpay/confirm → 已付款
```

本專案付款主路徑是前端導回後 `POST /api/orders/:id/ecpay/confirm`（QueryTradeInfo），**不依賴** ReturnURL。

## 測試卡（ECPay staging）

| 欄位 | 值 |
|------|-----|
| 卡號 | `4311` `9522` `2222` `2222`（四格：`#CCpart1`–`#CCpart4`） |
| 效期 | MM `12` / YY `30`（`#creditMM` `#creditYY`） |
| CVV | `222`（`#CreditBackThree`） |
| 持卡人 | 英文名，如 `WANG XIAO MING`（`#CCHolderTemp`） |
| 手機 | `0912345678`（`#CellPhoneCheck`） |
| 3DS OTP | `1234` |

來源：`.agents/skills/ecpay/AGENTS.md` 測試信用卡列。

## 綠界頁必做步驟（易錯）

依序處理，順序錯會卡死：

1. **Staging 警告**：「您目前正在使用的是綠界科技的付款測試環境…」→ 點 **「關閉」**
2. 填卡；卡號用 `pressSequentially` + `blur`（讓隱藏 `#CardNo` 等組好）
3. 同步隱藏 `input[name="Address"][type="hidden"]`（可見地址填了、隱藏空 → 送不出）
4. 點 **「立即付款」**（`#CreditPaySubmit`，是 `<a>` 不是 button）
5. 若再出 staging 警告 →「關閉」→ **再點一次「立即付款」**
6. **金額確認**：「您確定使用信用卡…」→ 點 **「確定」**（不是「關閉」）
7. **3DS**：
   - 可能先有「取得OTP服務密碼」→ 點它（**不要**點「重新取得OTP…」）
   - 輸入 `1234` → 點 **「送出(Submit)」**（同樣是 **link**，不是 button）
8. 等導回 `localhost:.../orders/`，斷言付款成功文案

## 本站 UI 選擇器注意

- **登入帳密**：`e2e/helpers/credentials.js` 讀 `.env` 的 `ADMIN_EMAIL`／`ADMIN_PASSWORD`（預設 `admin@hexschool.com`／`12345678`）。placeholders：`請輸入 Email`、`請輸入密碼`；`form` → button「登入」
- 商品：API 取 `stock > 0`（首筆 seed 可能庫存為 0）
- 成功斷言分開寫，避免 `/已付款|付款成功/` strict mode 命中兩個元素

## 除錯速查

| 症狀 | 處理 |
|------|------|
| 卡已填、點立即付款沒反應 | 關 staging「關閉」；再點；檢查隱藏 Address |
| 停在金額確認框 | 點「確定」 |
| 停在 3DS、OTP 已填 | 點 link「送出(Submit)」 |
| 一直點「重新取得」 | selector 太寬；改用 `/^取得OTP服務密碼/`、`/^送出/` |
| 導回仍 pending | 等 confirm；看 Network `QueryTradeInfo`／訂單 status |
| EADDRINUSE / 連不上 | 確認 3001 已有正確 `.env` 的 server |

失敗時：看 `test-results/**/test-failed-1.png` 與 `error-context.md`，不要盲目重試。

## 相關檔案

- 測試：`e2e/ecpay-checkout.spec.js`、`e2e/ecpay-webatm.spec.js`
- 帳密 helper：`e2e/helpers/credentials.js`
- 設定：`playwright.config.js`、`playwright.credit.config.js`（皆 `dotenv`）
- 指令：`package.json` → `test:e2e`／`test:e2e:ecpay`
- 文件：`docs/TESTING.md`、`docs/plans/archive/2026-09-23-playwright-ecpay-e2e.md`
- 金流後端：`src/routes/orderRoutes.js`（ecpay/checkout、confirm）、`public/js/pages/order-detail.js`

詳細 selector／對話框文案見 [reference.md](reference.md)。
