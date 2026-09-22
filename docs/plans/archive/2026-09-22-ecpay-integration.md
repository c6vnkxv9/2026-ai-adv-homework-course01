# 綠界 ECPay AIO 金流串接（本機開發限定版）

## User Story

As a 消費者, I want 在結帳後用真的信用卡金流（綠界 AIO）付款, so that 訂單付款狀態是真實驗證過的，而不是前端按鈕模擬的。

## 背景與硬性限制

本專案僅在本地端運行，綠界無法對 `localhost` 做 Server-to-Server 回呼（`ReturnURL`）。因此：

- 不依賴 `ReturnURL` / Server Notify 作為付款結果的唯一或主要依據。
- `ReturnURL` 設最小 stub（AIO 建單必填），但「收到 notify 才更新訂單」不是主流程。
- 付款結果確認改為：本地端主動呼叫綠界查詢 API（`Cashier/QueryTradeInfo/V5`）驗證後才更新訂單狀態。
- 消費者導回用 `ClientBackURL` / `OrderResultURL`（這兩者是**消費者自己的瀏覽器**導回，不經過綠界伺服器，所以本機也能作用；但不信任其帶回的資料，只當成「該去查詢了」的觸發訊號）。

## Spec

### API

| 方法 | 路徑 | 說明 | 認證 |
|---|---|---|---|
| POST | `/api/orders/:id/ecpay/checkout` | 產生 AIO 表單參數（`action_url` + `params`，含 `CheckMacValue`），寫入 `ecpay_merchant_trade_no` | JWT |
| POST | `/api/orders/:id/ecpay/confirm` | 主動查詢 `QueryTradeInfo/V5`，驗證 `CheckMacValue`／金額後更新訂單狀態 | JWT |
| POST | `/api/ecpay/notify` | `ReturnURL` 最小 stub，永遠回 `1\|OK`；驗證通過才嘗試更新，非主流程 | 無（綠界呼叫） |
| POST | `/orders/:id/ecpay-return` | `OrderResultURL` 落地頁，不信任 body，303 導回 `/orders/:id?payment=return` | 無（瀏覽器導回） |

### 狀態流

```
pending
  │  前往付款 → 產生 MerchantTradeNo，存回 order
  ▼
（消費者在綠界頁付款）
  │  瀏覽器導回 OrderResultURL → 303 → /orders/:id?payment=return
  ▼
前端呼叫 /ecpay/confirm（自動或手動點擊「確認付款結果」）
  │  後端呼叫 QueryTradeInfo/V5，驗證 CheckMacValue + TradeAmt
  ├─ TradeStatus=1 → paid
  ├─ TradeStatus=0 → 維持 pending（訊息：尚未查到付款結果，請稍後再確認）
  └─ 其他碼        → failed
```

`/confirm` 對已是 `paid`／`failed` 的訂單直接回傳現況（idempotent，不重複打綠界 API）。

### DB 變更

`orders` 新增（nullable，含 `ALTER TABLE` guard 相容既有 DB）：

- `ecpay_merchant_trade_no TEXT`
- `ecpay_trade_no TEXT`
- `payment_method TEXT`

### 錯誤碼

`ECPAY_CONFIG_ERROR`（環境變數未設定）、`ECPAY_NOT_INITIATED`（尚未前往付款就查詢）、`ECPAY_QUERY_FAILED`（呼叫綠界失敗）、`ECPAY_VERIFY_FAILED`（CheckMacValue 驗證失敗）、`ECPAY_MISMATCH`（訂單編號／金額與回應不符）。

### 前端

`views/pages/order-detail.ejs` + `public/js/pages/order-detail.js`：pending 訂單顯示「前往付款」（送出隱藏表單 POST 到綠界）＋「確認付款結果」兩顆按鈕，取代原本模擬用的「付款成功／付款失敗」。`?payment=return` 進站時自動觸發一次確認。

舊的 `PATCH /api/orders/:id/pay`（模擬付款）保留不動，供既有測試與其他用途使用，UI 不再顯示對應按鈕。

## Tasks

- [x] `src/utils/ecpay.js`：CheckMacValue 產生／驗證、URL encode、MerchantTradeDate 格式化、MerchantTradeNo 產生、取得 base URL
- [x] `src/database.js`：`orders` 新增三欄位 + migration guard
- [x] `src/routes/orderRoutes.js`：新增 `/ecpay/checkout`、`/ecpay/confirm`
- [x] `src/routes/ecpayRoutes.js`：`POST /api/ecpay/notify`
- [x] `src/routes/pageRoutes.js`：`POST /orders/:id/ecpay-return`
- [x] `app.js` 掛載 `/api/ecpay`
- [x] 前端 UI／JS
- [x] `tests/ecpayPayment.test.js`（mock `global.fetch`），加入 `vitest.config.js`
- [x] `npm test` 全套通過
- [x] 回寫 `ARCHITECTURE.md`／`FEATURES.md`／`DEVELOPMENT.md`／`CHANGELOG.md`，計畫移至 `archive/`
