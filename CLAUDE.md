# CLAUDE.md

## 專案概述

花卉電商 REST API — Express ~4.16、EJS、Vue 3（CDN）、better-sqlite3（無 ORM）、JWT、Tailwind CSS v4、Vitest + Supertest。

## 常用指令

```bash
npm run dev:server   # 啟動開發用 server（node server.js）
npm run dev:css      # watch 模式建置 Tailwind CSS
npm start            # 建置 CSS + 啟動 server
npm test             # vitest run（真實 SQLite，依序執行）
npm run openapi      # 從路由 @openapi 註解產生 openapi.json
```

## 關鍵規則

1. **JSON 回應一律用統一 envelope**：`{ data, error, message }`。成功時 `error: null`；失敗時 `error` 給英文代碼（如 `'VALIDATION_ERROR'`），`message` 給繁體中文說明。
2. **中英文分工**：程式碼識別字、JSON key、`error` 代碼一律英文；面向使用者的文字（`message`、OpenAPI summary、view 文案、seed／測試資料）一律繁體中文。
3. **沒有 controllers/services/models 分層**——路由檔（`src/routes/*.js`）直接寫驗證+SQL+邏輯，維持既有模式。
4. **命名不對稱**：API request body 用 camelCase，DB 欄位與回傳 JSON 用 snake_case，不要混用或擅自轉換。
5. **測試依序執行**：`vitest.config.js` 固定 `sequence.files`、不平行；共用真實 DB、無 reset。新增測試檔必須加入 `sequence.files`。
6. **功能開發使用 `docs/plans/` 記錄計畫**；完成後移至 `docs/plans/archive/`，並更新 `docs/FEATURES.md` 與 `docs/CHANGELOG.md`。

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流、schema、認證
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則、計畫歸檔流程
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表、行為描述與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
