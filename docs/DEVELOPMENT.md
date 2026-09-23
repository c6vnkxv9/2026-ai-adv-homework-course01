# 開發規範

本文件記錄專案實際遵循的慣例。新增或修改程式碼時請與這裡一致；若要打破慣例，先更新本文件並在 `docs/plans/` 留下決策紀錄。

---

## 模組系統

全專案（`app.js`、`server.js`、`src/`、`tests/`、`public/js` 以 script 標籤載入）使用 **CommonJS**：`require` / `module.exports`。

**唯一例外**：`vitest.config.js` 使用 ESM（`import { defineConfig } from 'vitest/config'`）——這是 Vitest 工具鏈慣例，不代表 app 改用 ESM。

新增原始碼檔案一律用 `require`/`module.exports`，不要用 `import`/`export`。

風格：function-based，**不使用 class**（`Auth` 是 plain object）。無 ESLint／Prettier；慣例為 2 空白、單引號、有分號。

---

## 命名規則對照表

| 對象 | 慣例 | 範例 |
|---|---|---|
| JS 變數、函式 | camelCase | `authMiddleware`、`generateOrderNo` |
| DB 欄位、JSON **輸出** | snake_case | `order_no`、`total_amount`、`image_url` |
| API request body **輸入** | camelCase（多數） | `productId`、`recipientName` |
| 例外：admin 商品 body 的圖檔欄 | 與 DB 同名 `image_url` | 見 `adminProductRoutes.js` |
| 常數 | SCREAMING_SNAKE_CASE | `SAFE_MESSAGES`、`TOKEN_KEY` |
| `src/` 檔名 | camelCase | `adminOrderRoutes.js` |
| `public/js/pages/`、`views/` | kebab-case | `admin-orders.js`、`order-detail.ejs` |
| 測試檔名 | camelCase + `.test.js` | `adminOrders.test.js` |
| 計畫檔名 | `YYYY-MM-DD-<feature-name>.md` | `2026-09-22-ecpay-integration.md` |
| `error` 代碼 | SCREAMING_SNAKE 英文 | `VALIDATION_ERROR` |
| `message`／UI 文案 | 繁體中文 | `'註冊成功'` |

**輸入／輸出不對稱**：body 用 camelCase，回傳與 DB 用 snake_case。不要擅自加轉換層把全站改成同一套。

---

## 中英文分工

| 用英文 | 用繁體中文 |
|---|---|
| 變數、函式、路由路徑、JSON key | `message` 內容 |
| `error` 欄位的值 | OpenAPI `summary`／`description` |
| 檔名、環境變數名 | EJS 文案、seed／測試 fixture 字串 |

---

## 錯誤處理模式

路由內**手動驗證 + 提早 `return res.status().json(...)`**，幾乎不 `throw`。

`try/catch` 僅用於 JWT（`authMiddleware`、`cartRoutes.dualAuth`）。

`errorHandler` 掛在 `app.js` 最後：未預期錯誤 → `{ error: 'INTERNAL_ERROR' }`；500 固定「伺服器內部錯誤」。目前路由幾乎不呼叫 `next(err)`，此層是安全網。若要走這條路，設定 `err.status`／`err.isOperational` 後 `next(err)`。

---

## 環境變數表

`dotenv` 只在 `app.js` 頂部載入一次。無集中 `config` 模組；使用處直接讀 `process.env`。

| 變數 | 用途 | 必要性 | 預設值 |
|---|---|---|---|
| `JWT_SECRET` | 簽發／驗證 JWT | **啟動必填**（`server.js` 缺則 exit） | 無 |
| `PORT` | listen port | 選填 | `3001` |
| `BASE_URL` | 組 ECPay `ReturnURL`／`ClientBackURL`／`OrderResultURL` | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | `cors` 的 `origin` | 選填 | `http://localhost:3001`（注意：example 寫 5173，與程式預設不一致） |
| `ADMIN_EMAIL` | seed admin email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | seed admin 密碼 | 選填 | `12345678` |
| `NODE_ENV` | `test` 時 bcrypt rounds=1 | 選填 | 未設則 rounds=10 |
| `ECPAY_MERCHANT_ID` | ECPay 商店代號 | AIO checkout/confirm 必填，缺則 500 `ECPAY_CONFIG_ERROR` | example 有值（公開測試帳號） |
| `ECPAY_HASH_KEY` | ECPay HashKey（CheckMacValue） | 同上必填 | example 有值 |
| `ECPAY_HASH_IV` | ECPay HashIV（CheckMacValue） | 同上必填 | example 有值 |
| `DATABASE_PATH` | SQLite 檔路徑；測試可設為 `database.test.sqlite` 或 `:memory:`，**勿**指向正式 `database.sqlite` | 選填 | 專案根目錄 `database.sqlite` |
| `ECPAY_ENV` | 值為 `'production'` 才走正式環境，其他值（含 `staging`）一律走 `payment-stage.ecpay.com.tw` | 選填 | `staging` |

複製 `.env.example` 為 `.env` 後至少設定 `JWT_SECRET` 再 `npm run dev:server`。

---

## 新增 API 端點步驟

1. 在對應 `src/routes/<area>Routes.js` 新增 handler（或新檔後於 `app.js` `app.use`）。  
2. 維持 flat-routes：驗證 → SQL → `res.json({ data, error, message })`。  
3. 加上 `@openapi` JSDoc（繁中 summary）。  
4. Request body 用 camelCase；回傳欄位跟 DB snake_case。  
5. 需要登入：掛 `authMiddleware`；需要 admin：再掛 `adminMiddleware`。  
6. 更新 `docs/FEATURES.md`、必要時 `ARCHITECTURE.md`。  
7. 新增／擴充 `tests/*.test.js`，並確認已在 `vitest.config.js` 的 `sequence.files`。  
8. 跑 `npm test`；可選 `npm run openapi`。  
9. 在 `CHANGELOG.md` 記一筆。

---

## 新增 middleware 步驟

1. 新增 `src/middleware/<name>Middleware.js`，`module.exports = function (req, res, next) { ... }`。  
2. 失敗時回傳統一 envelope，勿直接 `throw`（除非有意交給 `errorHandler`）。  
3. 全域：在 `app.js` 路由之前 `app.use`；路由級：在該 router `router.use` 或單一 route 參數。  
4. 文件：更新 `ARCHITECTURE.md` 認證／middleware 節，並在 FEATURES 標明哪些端點使用。

---

## 新增／變更 DB 步驟

1. 在 `src/database.js` 的 `initializeDatabase()` DDL 加入 `CREATE TABLE IF NOT EXISTS` 或文件化手動 migration（目前**沒有** migration 框架）。  
2. 若改既有表結構：開發環境可刪 `database.sqlite` 讓 seed 重建（**會清資料**）；或手寫 idempotent migration（範例：`migrateOrdersTable()`，用 `PRAGMA table_info` 檢查欄位是否存在，不存在才 `ALTER TABLE ... ADD COLUMN`，相容既有 DB 且不清資料）。  
3. Seed 變更寫在同檔 `seedAdminUser`／`seedProducts`（或新 seed 函式）。  
4. 更新 `ARCHITECTURE.md` schema 表與 FEATURES 相關行為。  
5. 測試共用真實 DB——注意新欄位對舊資料的相容性。

---

## JSDoc / OpenAPI 格式

路由用 `swagger-jsdoc` 可解析的 `@openapi` 區塊（YAML 寫在註解裡）。`summary`／`description` 用繁中。

```js
/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: 取得商品列表
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/', (req, res) => { /* ... */ });
```

產生 spec：

```bash
npm run openapi   # 輸出 openapi.json
```

Security schemes 定義在 `swagger-config.js`：`bearerAuth`、`sessionId`（header `X-Session-Id`）。需認證的端點在註解加：

```yaml
security:
  - bearerAuth: []
```

---

## 計畫歸檔流程

1. **命名格式**：`docs/plans/YYYY-MM-DD-<feature-name>.md`  
2. **文件結構**（建議標題）：  
   - User Story — 誰、要做什麼、為什麼  
   - Spec — API／UI／資料／錯誤行為  
   - Tasks — 可勾選實作清單  
3. **開發中**：計畫放在 `docs/plans/`；重要決策變更直接改同一份。  
4. **功能完成後**：  
   - 將計畫檔**移至** `docs/plans/archive/`  
   - 把長期有效結論寫進正式文件（ARCHITECTURE／DEVELOPMENT／FEATURES／TESTING）  
   - 更新 `docs/FEATURES.md` 狀態與行為  
   - 在 `docs/CHANGELOG.md` 新增條目  

`docs/plans/README.md` 有更完整的使用說明。
