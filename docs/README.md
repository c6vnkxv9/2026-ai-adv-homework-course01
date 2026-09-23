# 花卉電商 REST API

Express + EJS + Vue 3（CDN）的花卉電商示範專案：JSON API（統一 envelope）、伺服器渲染前台／後台頁面、SQLite、JWT 認證。

---

## 技術棧

| 項目 | 技術 |
|---|---|
| 後端 | Express ~4.16、better-sqlite3、JWT、bcrypt |
| 前端 | EJS、Vue 3（CDN）、Tailwind CSS v4 |
| 測試 | Vitest、Supertest |
| API 文件 | swagger-jsdoc → OpenAPI 3.0.3 |

---

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 環境變數（至少設定 JWT_SECRET）
cp .env.example .env
# 編輯 .env，填入 JWT_SECRET=...

# 3. 建置 CSS 並啟動（預設 http://localhost:3001）
npm start
```

開發時可分開跑：

```bash
npm run dev:css      # 終端機 1：Tailwind watch
npm run dev:server   # 終端機 2：node server.js
```

預設 admin（首次啟動 seed）：`admin@hexschool.com` / `12345678`（可用 `ADMIN_EMAIL`／`ADMIN_PASSWORD` 覆寫，僅在帳號尚不存在時生效）。

---

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm start` | 建置 CSS（minify）+ 啟動 server |
| `npm run dev:server` | 只啟動 server |
| `npm run dev:css` | Tailwind watch |
| `npm run css:build` | 單次建置 CSS |
| `npm test` | `test:unit` + `test:integration` |
| `npm run test:unit` | 純函式 unit（運費等） |
| `npm run test:integration` | 獨立 `database.test.sqlite` 的 API 整合測試 |
| `npm run test:e2e` | Playwright（需本機 server 已啟動；綠界網路 ATM） |
| `npm run openapi` | 從路由 `@openapi` 產生 `openapi.json` |
| `npm run postman` | 產生 `openapi.json` + `postman/collection.json` |

---

## 文件索引

| 文件 | 內容 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、路由總覽、認證、DB schema、資料流 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 命名、模組系統、環境變數、新增 API／DB 步驟、計畫歸檔 |
| [FEATURES.md](./FEATURES.md) | 功能行為、參數、錯誤碼、完成狀態 |
| [TESTING.md](./TESTING.md) | 測試順序、helper、撰寫步驟、常見陷阱 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/README.md) | 進行中計畫；完成後移入 [plans/archive/](./plans/archive/) |
| [`../CLAUDE.md`](../CLAUDE.md) | AI／協作者速查：關鍵規則與文件入口 |

詳細行為與整合注意事項以 `FEATURES.md`、`ARCHITECTURE.md` 為準；本 README 只做導覽。
