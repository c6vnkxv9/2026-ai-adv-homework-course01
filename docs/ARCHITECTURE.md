# 架構總覽

花卉電商 REST API：Express 後端提供 JSON API 與 EJS 伺服器渲染頁面；前端以 Vue 3（CDN）+ `public/js/pages/*.js` 做互動，不是 SPA build。

---

## 技術棧

| 層 | 技術 | 版本／備註 |
|---|---|---|
| HTTP 框架 | Express | `~4.16.1` |
| View | EJS | `^5.0.1`，兩段式 layout（無 `express-ejs-layouts`） |
| 前端互動 | Vue 3（CDN） | 各頁 `public/js/pages/*.js` 呼叫 `/api/*` |
| DB | better-sqlite3 | 同步 API、無 ORM；檔案 `database.sqlite` |
| 認證 | jsonwebtoken + bcrypt | JWT HS256、有效期 7 天 |
| CSS | Tailwind CSS v4 | `@tailwindcss/cli` 建置 `public/css/output.css` |
| 測試 | Vitest + Supertest | 打真實 SQLite，依序執行 |
| API 文件 | swagger-jsdoc | 從路由 `@openapi` 註解產生 OpenAPI 3.0.3 |

---

## 啟動流程

```
npm run start / npm run dev:server
        │
        ▼
  server.js
    ├─ require('./app')          ← 載入 app（含 dotenv、DB init、掛路由）
    ├─ 檢查 JWT_SECRET（缺則 process.exit(1)）
    └─ app.listen(PORT || 3001)

app.js（組裝，不 listen）
    ├─ require('dotenv').config()
    ├─ require('./src/database')  ← side effect：建表 + seed
    ├─ view engine = ejs、static(public/)
    ├─ cors / express.json / urlencoded / sessionMiddleware
    ├─ 掛載 /api/* 與 / 頁面路由
    ├─ 404 handler（API → JSON；頁面 → 404.ejs）
    └─ errorHandler
```

測試時只 `require('../app')`，**不會**跑 `server.js` 的 `JWT_SECRET` 檢查與 `listen()`。

---

## 目錄結構（每個檔案用途）

```
/
├── app.js                      # Express app 組裝與匯出（測試入口）
├── server.js                   # 啟動層：檢查 JWT_SECRET、listen
├── package.json                # scripts 與依賴
├── vitest.config.js            # Vitest：globals、fileParallelism:false、sequence.files
├── swagger-config.js           # OpenAPI metadata + securitySchemes + 掃描路徑
├── generate-openapi.js         # CLI：產生 openapi.json
├── database.sqlite             # 執行期 SQLite 檔（gitignore）
├── .env / .env.example         # 環境變數
│
├── src/
│   ├── database.js             # DB 連線、DDL、seed、module.exports = db
│   ├── middleware/
│   │   ├── authMiddleware.js   # Bearer JWT → req.user；失敗 401
│   │   ├── adminMiddleware.js  # req.user.role === 'admin'；否則 403
│   │   ├── sessionMiddleware.js# 讀 X-Session-Id → req.sessionId（全域）
│   │   └── errorHandler.js     # 全域錯誤 → envelope；500 不洩漏細節
│   ├── utils/
│   │   ├── ecpay.js            # 綠界 CheckMacValue／URL encode／MerchantTradeNo 等小工具函式
│   │   └── shipping.js         # 運費計算（宅配／超商／滿額免基本運費／偏遠／急件）
│   └── routes/
│       ├── authRoutes.js       # /api/auth
│       ├── productRoutes.js    # /api/products（公開）
│       ├── cartRoutes.js       # /api/cart（dualAuth）
│       ├── orderRoutes.js      # /api/orders（JWT，含綠界 AIO checkout/confirm）
│       ├── ecpayRoutes.js      # /api/ecpay（公開，ReturnURL 最小 stub）
│       ├── adminProductRoutes.js # /api/admin/products（JWT+admin）
│       ├── adminOrderRoutes.js # /api/admin/orders（JWT+admin）
│       └── pageRoutes.js       # HTML 頁面（EJS）
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs           # 前台外殼（header/footer + body）
│   │   └── admin.ejs           # 後台外殼（sidebar + body）
│   ├── partials/
│   │   ├── head.ejs            # <head>、CSS、Vue CDN
│   │   ├── header.ejs          # 前台導覽
│   │   ├── footer.ejs
│   │   ├── notification.ejs    # toast 容器
│   │   ├── admin-header.ejs
│   │   └── admin-sidebar.ejs
│   └── pages/
│       ├── index.ejs, product-detail.ejs, cart.ejs, checkout.ejs
│       ├── login.ejs, orders.ejs, order-detail.ejs, 404.ejs
│       └── admin/products.ejs, admin/orders.ejs
│
├── public/
│   ├── css/input.css, output.css
│   └── js/
│       ├── api.js              # apiFetch()：加 auth header、401 導 /login
│       ├── auth.js             # localStorage token/user/sessionId
│       ├── header-init.js, notification.js
│       └── pages/*.js          # 各頁 Vue/互動腳本
│
├── tests/
│   ├── setup.js                # getAdminToken、registerUser、re-export app/request
│   ├── shipping.test.js        # 運費純函式 unit test（不打 API／DB）
│   ├── auth.test.js
│   ├── products.test.js
│   ├── cart.test.js
│   ├── orders.test.js
│   ├── ecpayPayment.test.js    # 綠界 AIO checkout/confirm，mock global.fetch
│   ├── adminProducts.test.js
│   └── adminOrders.test.js
│
└── docs/                       # 本文件目錄（見 README.md）
```

**架構決策：flat fat-routes。** 沒有 controllers/services/models。驗證、SQL、商業邏輯都寫在 `src/routes/*.js`。除非複雜度明顯需要抽層，否則維持此模式。

---

## API 路由總覽

| 前綴 | 檔案 | 認證 | 說明 |
|---|---|---|---|
| `/api/auth` | `authRoutes.js` | 註冊/登入無；profile 要 JWT | 註冊、登入、個人資料 |
| `/api/products` | `productRoutes.js` | 無 | 公開商品列表／詳情 |
| `/api/cart` | `cartRoutes.js` | dualAuth（JWT 或 `X-Session-Id`） | 訪客＋登入購物車 CRUD |
| `/api/orders` | `orderRoutes.js` | JWT（`router.use(authMiddleware)`） | 建單、列表、詳情、模擬付款、綠界 AIO checkout/confirm |
| `/api/ecpay` | `ecpayRoutes.js` | 無（綠界呼叫） | `ReturnURL` 最小 stub（`/notify`），非付款確認主流程 |
| `/api/admin/products` | `adminProductRoutes.js` | JWT + admin | 後台商品 CRUD |
| `/api/admin/orders` | `adminOrderRoutes.js` | JWT + admin | 後台訂單列表／詳情 |
| `/` | `pageRoutes.js` | 無（前端 JS 再檢查） | EJS 前台／後台頁面 |

掛載順序見 `app.js`（admin 路由在 public products 之前，路徑不衝突）。

未知 `/api/*` → `404` + `{ error: 'NOT_FOUND', message: '找不到該路徑' }`；未知頁面 → `pages/404` + front layout。

---

## 統一回應格式（envelope）

所有 JSON API 一律：

```js
// 成功
{ data: <payload 或 null>, error: null, message: '<繁中>' }

// 失敗
{ data: null, error: '<ENGLISH_CODE>', message: '<繁中說明>' }
```

範例：

```json
{
  "data": { "user": { "id": "...", "email": "a@b.com", "name": "小明", "role": "user" }, "token": "eyJ..." },
  "error": null,
  "message": "登入成功"
}
```

```json
{
  "data": null,
  "error": "STOCK_INSUFFICIENT",
  "message": "庫存不足"
}
```

常見 `error` 代碼：`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`、`INTERNAL_ERROR`。

---

## 認證與授權

### JWT 參數

| 項目 | 值 |
|---|---|
| 演算法 | `HS256`（`jwt.verify(..., { algorithms: ['HS256'] })`） |
| Secret | `process.env.JWT_SECRET`（啟動必填） |
| 有效期 | `expiresIn: '7d'`（註冊／登入簽發時） |
| Payload | `{ userId, email, role }` |
| Header | `Authorization: Bearer <token>` |

簽發位置：`authRoutes.js` 的 register／login。  
`req.user` 形狀（middleware 設定）：`{ userId, email, role }`。

### middleware 行為

**`sessionMiddleware`（全域）**  
讀 `X-Session-Id` header；有則設 `req.sessionId`，無則不設。不擋請求。

**`authMiddleware`**  
1. 無 `Bearer` → 401 `UNAUTHORIZED`「請先登入」  
2. `jwt.verify` 失敗 → 401「Token 無效或已過期」  
3. payload 的 `userId` 在 `users` 表不存在 → 401「使用者不存在，請重新登入」  
4. 成功 → `req.user` 後 `next()`

**`adminMiddleware`**（須接在 `authMiddleware` 之後）  
`req.user.role !== 'admin'` → 403 `FORBIDDEN`「權限不足」。

**`dualAuth`（僅 `cartRoutes.js` 內部）**  
1. 有 `Authorization: Bearer` → 驗證 JWT（同 authMiddleware 邏輯）；**token 無效直接 401，不 fallback session**  
2. 無 Bearer 但有 `req.sessionId` → 訪客模式 `next()`  
3. 兩者皆無 → 401「請提供有效的登入 Token 或 X-Session-Id」

購物車擁有者：`getOwnerCondition()` → 登入用 `user_id = req.user.userId`；訪客用 `session_id = req.sessionId`。

### 前端認證（`public/js/auth.js`）

| localStorage key | 用途 |
|---|---|
| `flower_token` | JWT |
| `flower_user` | 使用者 JSON |
| `flower_session_id` | 訪客 session（無則 `crypto.randomUUID()` 產生） |

`getAuthHeaders()` 同時帶 `Authorization`（若有 token）與 `X-Session-Id`。  
`apiFetch` 遇 401 清 token/user 並導向 `/login`。

### 角色摘要

| 角色 | 可呼叫 |
|---|---|
| 匿名 | Products、Auth register/login、Cart（需 Session-Id） |
| 登入 user | Cart（JWT）、Orders 全部、Auth profile |
| admin | 上述 + Admin Products／Orders |

---

## 資料庫 schema

檔案：`database.sqlite`（專案根目錄）。  
初始化：`src/database.js` 載入時執行 `initializeDatabase()`。  
PRAGMA：`journal_mode = WAL`、`foreign_keys = ON`。

### `users`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY（UUID） |
| `email` | TEXT | UNIQUE NOT NULL |
| `password_hash` | TEXT | NOT NULL（bcrypt） |
| `name` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL DEFAULT `'user'`；`CHECK(role IN ('user','admin'))` |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |

### `products`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `description` | TEXT | 可 NULL |
| `price` | INTEGER | NOT NULL；`CHECK(price > 0)`（單位：元，整數） |
| `stock` | INTEGER | NOT NULL DEFAULT 0；`CHECK(stock >= 0)` |
| `image_url` | TEXT | 可 NULL |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |
| `updated_at` | TEXT | NOT NULL DEFAULT `datetime('now')`（更新時由 SQL 設 `datetime('now')`） |

### `cart_items`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | 訪客用；可 NULL |
| `user_id` | TEXT | 登入用；FK → `users(id)`；可 NULL |
| `product_id` | TEXT | NOT NULL；FK → `products(id)` |
| `quantity` | INTEGER | NOT NULL DEFAULT 1；`CHECK(quantity > 0)` |

同一擁有者＋同一商品應只有一列（應用層累加，無 UNIQUE 約束）。

### `orders`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `order_no` | TEXT | UNIQUE NOT NULL（格式 `ORD-YYYYMMDD-XXXXX`） |
| `user_id` | TEXT | NOT NULL；FK → `users(id)` |
| `recipient_name` | TEXT | NOT NULL |
| `recipient_email` | TEXT | NOT NULL |
| `recipient_address` | TEXT | NOT NULL |
| `total_amount` | INTEGER | NOT NULL（商品小計 + `shipping_fee`） |
| `shipping_method` | TEXT | NOT NULL；`'home'` \| `'convenience'`（預設 `'home'`） |
| `shipping_fee` | INTEGER | NOT NULL；由 `src/utils/shipping.js` 計算 |
| `is_remote_area` | INTEGER | NOT NULL DEFAULT 0（SQLite boolean 0/1） |
| `is_express` | INTEGER | NOT NULL DEFAULT 0（當日急件） |
| `status` | TEXT | NOT NULL DEFAULT `'pending'`；`CHECK(status IN ('pending','paid','failed'))` |
| `ecpay_merchant_trade_no` | TEXT | 可 NULL；本系統產生、送給綠界的 `MerchantTradeNo`（每次 `/ecpay/checkout` 重新產生） |
| `ecpay_trade_no` | TEXT | 可 NULL；綠界回傳的 `TradeNo`，`/ecpay/confirm` 或 `/ecpay/notify` 驗證成功後寫入 |
| `payment_method` | TEXT | 可 NULL；綠界回傳的 `PaymentType`（如 `Credit_CreditCard`） |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |

> ECPay 與運費欄位由 `src/database.js` 的 `migrateOrdersTable()` 以 `ALTER TABLE ... ADD COLUMN`（idempotent，先查 `PRAGMA table_info` 再補）相容既有 DB，不會清資料。

### `order_items`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `order_id` | TEXT | NOT NULL；FK → `orders(id)` |
| `product_id` | TEXT | NOT NULL（快照當下商品 id；**無** FK 到 products） |
| `product_name` | TEXT | NOT NULL（快照） |
| `product_price` | INTEGER | NOT NULL（快照） |
| `quantity` | INTEGER | NOT NULL |

### Seed

- Admin：`ADMIN_EMAIL`／`ADMIN_PASSWORD`（預設 `admin@hexschool.com`／`12345678`），role=`admin`；帳號已存在則不重建。bcrypt rounds：`NODE_ENV===test` 時為 1，否則 10。  
- 商品：`products` 為空時插入 8 筆繁中花卉範例。

---

## 資料流範例：建立訂單

1. 前端 `checkout.js` → `apiFetch('POST /api/orders', { recipientName, recipientEmail, recipientAddress, shippingMethod, isRemoteArea, isExpress })`，自動帶 Bearer。  
2. `orderRoutes`：`authMiddleware` → handler。  
3. 驗證收件欄位、email 格式、`shippingMethod`（`home`｜`convenience`）。  
4. 查 `cart_items` WHERE `user_id`（**只用登入購物車，不合併訪客車**）。空車 → `CART_EMPTY`。  
5. 逐項比對 `quantity` 與 `products.stock`；不足 → `STOCK_INSUFFICIENT`。  
6. `subtotal` = Σ(price × qty)；呼叫 `calculateShippingFee` 得 `shipping_fee`；`total_amount` = subtotal + shipping_fee。  
7. `db.transaction()` 原子執行：  
   - INSERT `orders`（status=`pending`，含配送欄位）  
   - INSERT 各 `order_items`（名稱／價格快照）  
   - `UPDATE products SET stock = stock - ?`  
   - `DELETE FROM cart_items WHERE user_id = ?`  
8. 回傳 `201` + 訂單摘要（含 `shipping_fee`／`total_amount`）。

---

## 金流／第三方整合

**已串接綠界 ECPay AIO（全方位金流），本機開發限定版。** 決策紀錄見 `docs/plans/archive/2026-09-22-ecpay-integration.md`。

### 架構限制與設計原則

本專案僅在本地端運行，綠界無法對 `localhost` 做 Server-to-Server 回呼（`ReturnURL`）。因此：

- **不依賴** `ReturnURL` / Server Notify 作為付款結果的唯一或主要依據。
- `ReturnURL` 設為最小 stub（`POST /api/ecpay/notify`，AIO 建單必填欄位），永遠回應 `1|OK`；驗證通過才會嘗試更新訂單，但**這不是主流程**，本機環境下幾乎不會被觸發（綠界連不到 `localhost`）。
- 付款結果確認**一律由本地端主動呼叫綠界查詢 API**（`Cashier/QueryTradeInfo/V5`）驗證 `CheckMacValue` 與金額後才更新訂單狀態。
- 消費者導回改用 `ClientBackURL` / `OrderResultURL`——這兩者是**消費者自己的瀏覽器**導回（不經過綠界伺服器），所以本機也能作用；但不信任其帶回的資料，只當成「該去查詢了」的觸發訊號。

### 端點與流程

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/orders/:id/ecpay/checkout` | 產生 AIO 表單參數（`MerchantID`、`MerchantTradeNo`、`CheckMacValue` 等），寫回 `orders.ecpay_merchant_trade_no` |
| POST | `/api/orders/:id/ecpay/confirm` | 主動查詢 `QueryTradeInfo/V5`，驗證後依 `TradeStatus` 更新狀態（唯一狀態確認來源） |
| POST | `/api/ecpay/notify` | `ReturnURL` 最小 stub |
| POST | `/orders/:id/ecpay-return` | `OrderResultURL` 落地頁（頁面路由，非 API），303 導回 `/orders/:id?payment=return` |

```
pending
  │  前往付款 → POST /ecpay/checkout（產生 MerchantTradeNo）
  │  前端動態組 <form method="POST"> 送出到綠界（不可用 iframe）
  ▼
消費者在綠界頁付款
  │  瀏覽器導回 OrderResultURL → 303 → /orders/:id?payment=return
  ▼
前端呼叫 POST /ecpay/confirm（自動觸發一次，按鈕可重複手動觸發）
  │  後端呼叫 QueryTradeInfo/V5，驗證 CheckMacValue + TradeAmt
  ├─ TradeStatus=1 → paid（寫入 ecpay_trade_no、payment_method）
  ├─ TradeStatus=0 → 維持 pending（信用卡付款後約 10 分鐘內查詢可能還查不到）
  └─ 其他碼        → failed
```

`/ecpay/confirm` 對已是 `paid`／`failed` 的訂單直接回傳現況，不重複呼叫綠界（idempotent）。

### 實作細節

- `src/utils/ecpay.js`：`ecpayUrlEncode`（SHA256 CheckMacValue 專用，urlencode → 轉小寫 → .NET 字元還原）、`generateCheckMacValue`／`verifyCheckMacValue`（timing-safe）、`formatMerchantTradeDate`（UTC+8）、`generateMerchantTradeNo`（英數字、≤20 字元，每次 checkout 重新產生）、`getEcpayBaseUrl`（依 `ECPAY_ENV` 切換 stage／production，非 `'production'` 一律視為 stage）。
- 查詢 API 回應為 URL-encoded 字串（非 JSON），以 `new URLSearchParams(text)` 解析。
- 測試（`tests/ecpayPayment.test.js`）以覆寫 `global.fetch` 模擬綠界查詢回應，避免依賴外網；回應的 `CheckMacValue` 用同一套 `generateCheckMacValue` 現算，確保測試資料與正式邏輯一致。
- `ChoosePayment` 固定 `'ALL'`（綠界付款頁可選信用卡、網路 ATM 等）。
- 環境變數：沿用既有 `ECPAY_MERCHANT_ID`／`ECPAY_HASH_KEY`／`ECPAY_HASH_IV`／`ECPAY_ENV`，並開始使用原本預留但未用的 `BASE_URL`（組 `ReturnURL`／`ClientBackURL`／`OrderResultURL`，預設 `http://localhost:3001`）。
- 舊的 `PATCH /api/orders/:id/pay`（模擬付款）保留不動，供既有測試與 API 用途；前台 UI 已改用上述真實流程。

---

## 頁面渲染模式

`pageRoutes.js` 的 `renderFront`／`renderAdmin`：

1. 先 `res.render('pages/...')` 得 HTML 字串 `body`  
2. 再 `res.render('layouts/front|admin', { body, title, pageScript, ... })`  

layout 透過 `pageScript` 載入對應 `public/js/pages/<name>.js`。頁面本身不做伺服器端權限檢查；後台頁面由前端 `Auth.requireAdmin()` 擋。

---

## OpenAPI

- 設定：`swagger-config.js`（title「E-Commerce Demo API」、security：`bearerAuth`、`sessionId`）  
- 產生：`npm run openapi` → `openapi.json`  
- 註解寫在各 `src/routes/*.js` 的 `@openapi` JSDoc（summary／description 用繁中）
