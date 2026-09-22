# Changelog

本專案的重要變更紀錄。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [Unreleased]

### Added

- 綠界 ECPay AIO 金流串接（本機開發限定版）：`POST /api/orders/:id/ecpay/checkout`（產生付款表單）、`POST /api/orders/:id/ecpay/confirm`（主動查詢 `QueryTradeInfo/V5` 並驗證後更新訂單狀態，付款結果確認的唯一依據）、`POST /api/ecpay/notify`（`ReturnURL` 最小 stub，非主流程）、`POST /orders/:id/ecpay-return`（`OrderResultURL` 落地頁）。`src/utils/ecpay.js` 提供 CheckMacValue 產生／驗證等工具函式。`orders` 表新增 `ecpay_merchant_trade_no`／`ecpay_trade_no`／`payment_method` 欄位。訂單詳情頁 UI 改為「前往付款」＋「確認付款結果」。詳見 `docs/plans/archive/2026-09-22-ecpay-integration.md`。

### Changed

- （尚無）

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
