# Changelog

本專案的重要變更紀錄。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [Unreleased]

### Added

- 整合測試 `tests/integration/orderFlow.test.js`（獨立測試 DB、運費／庫存／失敗不留髒資料）；E2E `e2e/ecpay-webatm.spec.js`（網路 ATM）；`npm run postman` 產生 `postman/collection.json`。
- Playwright E2E：`e2e/ecpay-checkout.spec.js` 驗證「加購 → 結帳 → 綠界 staging 測試信用卡（含 3DS）→ 訂單已付款」完整瀏覽器流程；指令 `npm run test:e2e`／`npm run test:e2e:ecpay`。詳見 `docs/plans/archive/2026-09-23-playwright-ecpay-e2e.md`。
- 運費計算模組 `src/utils/shipping.js`：宅配基本運費 120、超商取貨 60、小計滿 1,500 免基本運費、偏遠 +200、當日急件 +250。`POST /api/orders` 新增 `shippingMethod`／`isRemoteArea`／`isExpress`；`orders` 表新增 `shipping_method`／`shipping_fee`／`is_remote_area`／`is_express`；`total_amount` = 商品小計 + 運費。結帳頁同步可選配送條件。單元測試見 `tests/shipping.test.js`。詳見 `docs/plans/archive/2026-09-23-shipping-fee.md`。
- 綠界 ECPay AIO 金流串接（本機開發限定版）：`POST /api/orders/:id/ecpay/checkout`（產生付款表單）、`POST /api/orders/:id/ecpay/confirm`（主動查詢 `QueryTradeInfo/V5` 並驗證後更新訂單狀態，付款結果確認的唯一依據）、`POST /api/ecpay/notify`（`ReturnURL` 最小 stub，非主流程）、`POST /orders/:id/ecpay-return`（`OrderResultURL` 落地頁）。`src/utils/ecpay.js` 提供 CheckMacValue 產生／驗證等工具函式。`orders` 表新增 `ecpay_merchant_trade_no`／`ecpay_trade_no`／`payment_method` 欄位。訂單詳情頁 UI 改為「前往付款」＋「確認付款結果」。詳見 `docs/plans/archive/2026-09-22-ecpay-integration.md`。

### Changed

- 綠界 AIO `ChoosePayment` 由 `Credit` 改為 `ALL`，付款頁可選網路 ATM 等。
- 測試分流：`test:unit`／`test:integration`／`test:e2e`／`postman`；整合測試改打獨立 `database.test.sqlite`。
- 前台「花市價籤」視覺與 Stitch 設計專案逐頁比對後修正：商品詳情頁新增「你可能也喜歡」相關商品區塊（取自 `/api/products`）；購物車頁改為桌機雙欄版面（商品列表 + 右側 sticky 結帳摘要）；登入頁卡片上方新增品牌語氣 hero 標題。詳見 `docs/plans/archive/2026-09-23-stitch-ui-fidelity-fixes.md`。

### Fixed

- （尚無）

---

## [1.0.0] — 文件基準日

### Added

- 花卉電商核心功能：Auth、公開商品、雙模式購物車、訂單（含模擬付款）、後台商品／訂單管理
- EJS 前台／後台頁面 + Vue 3 CDN 互動
- Vitest + Supertest 整合測試（依序執行）
- OpenAPI 產製（`npm run openapi`）
- 完整 `docs/`：README、ARCHITECTURE、DEVELOPMENT、FEATURES、TESTING、CHANGELOG、plans／archive

### Notes

- ECPay 環境變數已預留於 `.env.example`，金流尚未串接；付款為 `PATCH /api/orders/:id/pay` 模擬
