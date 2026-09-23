# Checkout E2E — 綠界頁面參考

從已通過的 `e2e/ecpay-checkout.spec.js` 抽出，供修測試或重寫自動化時對照。綠界 staging UI 可能變動；以實際 DOM 為準。

## 綠界 AIO 付款頁（`payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`）

### 信用卡欄位

| 用途 | Selector |
|------|----------|
| 卡號四段 | `#CCpart1` `#CCpart2` `#CCpart3` `#CCpart4` |
| 隱藏完整卡號 | `#CardNo`（應為 16 碼無分隔） |
| 效期 | `#creditMM` `#creditYY` → 隱藏 `#CardValidMM` `#CardValidYY` |
| CVV | `#CreditBackThree` → 隱藏 `#CardAuthCode` |
| 持卡人 | `#CCHolderTemp` → 隱藏 `#CardHolder` |
| 手機 | `#CellPhoneCheck` → 隱藏 `#CellPhone` |
| Email | `#EmailTemp`（另有同名 hidden `Email`） |
| 帳單地址（可見） | `input[placeholder="南港區成功路一段58號5樓"]` |
| 帳單地址（隱藏，必同步） | `input[name="Address"][type="hidden"]` |
| 立即付款 | `#CreditPaySubmit` 或 `getByRole('link', { name: '立即付款' })` |
| Staging 快捷（非本 E2E 主路徑） | `#aCREDIT`「測試付款請點此」 |

填卡建議：`click` → `fill('')` → `pressSequentially(value, { delay: 15 })` → `blur()`，再檢查 `#CardNo` 是否已組好。

### 對話框（文案）

| 時機 | 文案關鍵字 | 操作 |
|------|------------|------|
| 進頁／誤觸送出 | 付款測試環境…勿進行相關的付款動作 | button「關閉」 |
| 送出後 | 您確定使用信用卡，支付此筆訂單金額 | button「確定」／「取消」 |

「關閉」≠「確定」。把金額確認關掉或點取消會中止付款。

### 模擬 3DS（交易驗證碼確認）

| 元素 | 注意 |
|------|------|
| 「取得OTP服務密碼(Get the password)」 | 第一步；可能是 button |
| 「重新取得OTP服務密碼(Get the password again)」 | **勿點**；selector 勿寫成 `/Get the password/i` |
| OTP 提示 | 頁面會顯示 `(OTP密碼：1234)` |
| 輸入框 | textbox「請輸入網路刷卡OTP服務密碼…」 |
| 「送出(Submit)」 | **`<a>` / link**，不是 button |
| 「取消(Cancel)」 | link |

## 本站頁面選擇器

| 頁面 | 動作 | Selector／文案 |
|------|------|----------------|
| `/login` | 登入 | Email／密碼用 `getAdminCredentials()`（`.env` `ADMIN_EMAIL`／`ADMIN_PASSWORD`）；placeholders：`請輸入 Email`、`請輸入密碼`；`form` → button「登入」 |
| `/products/:id` | 加購 | button「加入購物車」 |
| `/cart` | 結帳 | button「前往結帳」 |
| `/checkout` | 收件 | placeholders：收件人姓名／Email／收件地址 |
| | 建單 | button「確認送出訂單」 |
| `/orders/:id` | 導向綠界 | button「前往付款」 |
| | 成功 | `付款成功！感謝您的購買。` + exact `已付款` |

## Helper 邏輯摘要（與 spec 對齊）

- `dismissEcpayDialogs`：最多關 5 次「關閉」
- `handlePayConfirmFlow`：關 staging → 再點立即付款 → 等「確定」
- `complete3dsIfPresent`：取得 OTP（`/^取得OTP服務密碼/`）→ fill `1234` → link `/^送出/` → 等 localhost

## 設定

- `playwright.config.js`／`playwright.credit.config.js`：頂部 `require('dotenv').config()`；`baseURL` 預設 `http://localhost:3001`，`workers: 1`，timeout 偏長（綠界＋3DS）
- 帳密：`e2e/helpers/credentials.js` → `ADMIN_EMAIL`／`ADMIN_PASSWORD`
- 產物目錄已 gitignore：`test-results/`、`playwright-report/`、`e2e/artifacts/`
