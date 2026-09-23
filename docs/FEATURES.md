# 功能狀態

新增功能前先查這裡，避免重複開發。新增／修改端點或行為後，請同步更新本文件與 `CHANGELOG.md`。

狀態標記：✅ 已完成｜⚠️ 部分完成／模擬｜❌ 未實作

---

## 1. Auth — `/api/auth`（`src/routes/authRoutes.js`）✅

### 行為概述

註冊與登入簽發 JWT（7 天）；profile 需 Bearer。新註冊一律 `role: 'user'`；admin 僅由 seed 建立。密碼以 bcrypt（salt rounds 10）雜湊，回傳永不含 `password_hash`。

### 端點

| 方法 | 路徑 | 認證 | 說明 |
|---|---|---|---|
| POST | `/api/auth/register` | 無 | 註冊並回傳 JWT |
| POST | `/api/auth/login` | 無 | 登入並回傳 JWT |
| GET | `/api/auth/profile` | JWT | 取得自己的資料 |

### POST `/api/auth/register`

**Body（camelCase）**

| 欄位 | 必填 | 規則 |
|---|---|---|
| `email` | 是 | 簡易 regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| `password` | 是 | 長度 ≥ 6 |
| `name` | 是 | 非空 |

**成功**：`201`，`data: { user: { id, email, name, role }, token }`，`message: '註冊成功'`

**錯誤**

| HTTP | error | 情境 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 缺欄位／email 格式錯／密碼過短 |
| 409 | `CONFLICT` | Email 已被註冊 |

### POST `/api/auth/login`

**Body**：`email`、`password` 必填。

**成功**：`200`，同 register 形狀，`message: '登入成功'`

**錯誤**：缺欄位 → 400 `VALIDATION_ERROR`；帳號不存在或密碼錯 → 401 `UNAUTHORIZED`「Email 或密碼錯誤」（不區分哪一種，防 enumeration）。

### GET `/api/auth/profile`

**成功**：`data` 為 `{ id, email, name, role, created_at }`（snake_case 的 `created_at`）。

**錯誤**：無／無效 token → 401（middleware）；user 已刪 → 404 `NOT_FOUND`。

---

## 2. Products（公開）— `/api/products`（`productRoutes.js`）✅

### 行為概述

任何人可讀。列表依 `created_at DESC` 分頁。詳情回傳整列商品（含 `stock`）。無搜尋、篩選、排序參數。

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/products` | 商品列表 |
| GET | `/api/products/:id` | 商品詳情 |

### GET `/api/products`

**Query**

| 參數 | 預設 | 規則 |
|---|---|---|
| `page` | `1` | `Math.max(1, parseInt \|\| 1)` |
| `limit` | `10` | 夾在 1～100 |

**成功 `data`**：

```json
{
  "products": [ { "id", "name", "description", "price", "stock", "image_url", "created_at", "updated_at" } ],
  "pagination": { "total", "page", "limit", "totalPages" }
}
```

### GET `/api/products/:id`

成功回傳單一商品物件；不存在 → 404 `NOT_FOUND`「商品不存在」。

---

## 3. Cart — `/api/cart`（`cartRoutes.js`）✅ — 雙模式認證

### 行為概述

內部 `dualAuth`：

1. 有 `Authorization: Bearer` → 驗證 JWT；**無效即 401，不改走訪客**  
2. 無 Bearer、有 `X-Session-Id`（經全域 `sessionMiddleware` 設到 `req.sessionId`）→ 訪客  
3. 皆無 → 401「請提供有效的登入 Token 或 X-Session-Id」

擁有者欄位：登入用 `user_id`；訪客用 `session_id`。  
**登入後不會自動合併訪客購物車**——兩套資料各自獨立。結帳只讀 `user_id` 購物車。

**加入商品（累加）**：同擁有者已有同一 `product_id` → `quantity += qty`（非另開列）。數量不可超過當下 `products.stock`。

列表 JOIN products，回傳嵌套 `product: { name, price, stock, image_url }`；`total` = Σ(price × quantity)。

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/cart` | 查看購物車 |
| POST | `/api/cart` | 加入商品 |
| PATCH | `/api/cart/:itemId` | 更新數量（覆寫，非累加） |
| DELETE | `/api/cart/:itemId` | 移除項目 |

### POST `/api/cart`

**Body**

| 欄位 | 必填 | 預設 | 規則 |
|---|---|---|---|
| `productId` | 是 | — | 商品 UUID |
| `quantity` | 否 | `1` | 正整數 |

**錯誤**：缺 productId／quantity 非法 → 400 `VALIDATION_ERROR`；商品不存在 → 404；超庫存 → 400 `STOCK_INSUFFICIENT`。

成功一律 `200`（含新建與累加），`message: '已加入購物車'`。

### PATCH `/api/cart/:itemId`

**Body**：`quantity` 必填，正整數（覆寫整筆數量）。  
只能改自己的項目（owner 條件）；否則 404。超庫存 → `STOCK_INSUFFICIENT`。

### DELETE `/api/cart/:itemId`

成功 `data: null`；非己有或不存在 → 404。

---

## 4. Orders — `/api/orders`（`orderRoutes.js`）✅（含真實綠界 ECPay AIO 金流，本機開發限定版）

### 行為概述

整支 router `router.use(authMiddleware)`——全部要 JWT。  
只處理**登入使用者**的 `cart_items`（`user_id`）。

建單使用 `db.transaction()`：寫訂單、寫明細快照、扣庫存、清空該使用者購物車。  
訂單編號：`ORD-YYYYMMDD-` + UUID 前 5 碼大寫。  
初始 `status: 'pending'`。  
運費由 `src/utils/shipping.js` 依配送方式／滿額免基本運費／偏遠／急件計算，`total_amount` = 商品小計 + `shipping_fee`。

**金流串接**（詳見 `docs/ARCHITECTURE.md` 「金流／第三方整合」）：`pending` 訂單呼叫 `/ecpay/checkout` 取得綠界 AIO 表單參數並導向付款頁；消費者付款完成後瀏覽器（非 ECPay 伺服器）導回本機訂單頁，前端呼叫 `/ecpay/confirm` 主動查詢 `QueryTradeInfo/V5`、驗證 `CheckMacValue` 與金額後才更新狀態為 `paid`／`failed`。**不依賴** `ReturnURL` Server-to-Server 回呼（本機連不到），該回呼僅有最小 stub（`POST /api/ecpay/notify`）。

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/orders` | 從購物車建單 |
| GET | `/api/orders` | 自己的訂單列表（無分頁） |
| GET | `/api/orders/:id` | 自己的訂單詳情 |
| PATCH | `/api/orders/:id/pay` | 模擬付款（保留供測試／API 用途；前台 UI 已改用綠界流程） |
| POST | `/api/orders/:id/ecpay/checkout` | 產生綠界 AIO 付款表單參數（`action_url` + `params`），僅 `pending` 訂單可用，寫入 `ecpay_merchant_trade_no` |
| POST | `/api/orders/:id/ecpay/confirm` | **付款結果確認的唯一依據**：主動查詢綠界並驗證後更新狀態；已是最終狀態則直接回傳現況（idempotent，不重複打綠界 API） |

### POST `/api/orders`

**Body（camelCase）**

| 欄位 | 必填 | 規則 |
|---|---|---|
| `recipientName` | 是 | 非空 |
| `recipientEmail` | 是 | 同上 email regex |
| `recipientAddress` | 是 | 非空 |
| `shippingMethod` | 是 | `'home'`（宅配）或 `'convenience'`（超商取貨） |
| `isRemoteArea` | 否 | 預設 `false`；`true` 時偏遠加收 200 |
| `isExpress` | 否 | 預設 `false`；`true` 時當日急件加收 250 |

**運費規則**（`src/utils/shipping.js`）

| 條件 | 費用 |
|---|---|
| 宅配基本運費 | 120 |
| 超商取貨（非基本運費） | 60 |
| 商品小計 ≥ 1,500 | 免**基本**運費（僅宅配 120；超商 60 仍收） |
| 偏遠地區 | +200 |
| 當日急件 | +250 |

**業務步驟**

1. 驗證 body（含 `shippingMethod`）  
2. 讀購物車 JOIN 商品  
3. 空車 → 400 `CART_EMPTY`  
4. 任一项 quantity > stock → 400 `STOCK_INSUFFICIENT`（message 列出商品名）  
5. `subtotal` = Σ(price × qty)；`shipping_fee` = `calculateShippingFee(...)`；`total_amount` = subtotal + shipping_fee  
6. Transaction：INSERT order（含配送欄位）／order_items／扣 stock／DELETE cart  
7. `201` 回傳 `{ id, order_no, total_amount, shipping_fee, shipping_method, is_remote_area, is_express, status, items, created_at }`

### GET `/api/orders`

`data.orders`：`{ id, order_no, total_amount, status, created_at }[]`，依 `created_at DESC`。無 query 分頁。

### GET `/api/orders/:id`

必須 `user_id` 相符；否則當 404。`data` 含完整 order 列 + `items`（order_items 全欄）。

### PATCH `/api/orders/:id/pay`（模擬付款 ⚠️）

**Body**：`action` 必填，僅允許 `'success'` | `'fail'`。

| action | 新 status |
|---|---|
| `success` | `paid` |
| `fail` | `failed` |

僅 `status === 'pending'` 可改；否則 400 `INVALID_STATUS`。  
非己訂單 → 404。  
**不呼叫 ECPay 或任何第三方**；純測試／備用端點，見下方「金流」的真實整合。

### POST `/api/orders/:id/ecpay/checkout`

只有自己的 `pending` 訂單可呼叫；`ECPAY_MERCHANT_ID`／`ECPAY_HASH_KEY`／`ECPAY_HASH_IV` 未設定 → 500 `ECPAY_CONFIG_ERROR`。

**成功 `200`**：`data: { action_url, params }`。`params` 含 `MerchantID`、`MerchantTradeNo`（新產生、寫回訂單）、`MerchantTradeDate`（UTC+8）、`TotalAmount`、`ItemName`（訂單明細組成，截斷 200 字）、`ReturnURL`（指向 `/api/ecpay/notify`）、`ClientBackURL`／`OrderResultURL`（指向本機訂單頁／落地頁）、`ChoosePayment: 'ALL'`（可選信用卡／網路 ATM 等）、`CheckMacValue`（SHA256）。前端需動態組 `<form method="POST">` 送出（不可用 iframe）。

### POST `/api/orders/:id/ecpay/confirm`

流程：非 `pending` → 直接回傳現況；未曾 `/ecpay/checkout` → 400 `ECPAY_NOT_INITIATED`；呼叫綠界失敗 → 502 `ECPAY_QUERY_FAILED`；`CheckMacValue` 驗證失敗 → 502 `ECPAY_VERIFY_FAILED`；`MerchantTradeNo` 或金額與訂單不符 → 502 `ECPAY_MISMATCH`。

驗證通過後依 `TradeStatus`：`'1'` → `paid`（寫入 `ecpay_trade_no`、`payment_method`）；`'0'` → 維持 `pending`（訊息提示稍後再查，信用卡查詢在付款後約 10 分鐘內可能還查不到）；其他 → `failed`。

---

## 5. Admin Products — `/api/admin/products`（`adminProductRoutes.js`）✅

### 行為概述

`router.use(authMiddleware, adminMiddleware)`。列表分頁同公開 API。  
刪除前檢查：該商品是否出現在任一 `status = 'pending'` 的訂單明細；有則 409，避免未完成訂單缺品。

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/admin/products` | 列表 |
| POST | `/api/admin/products` | 新增 |
| PUT | `/api/admin/products/:id` | 編輯（部分欄位可省略＝保留原值） |
| DELETE | `/api/admin/products/:id` | 刪除 |

### GET — Query

同公開商品：`page` 預設 1、`limit` 預設 10（1～100）。

### POST — Body

| 欄位 | 必填 | 規則 |
|---|---|---|
| `name` | 是 | 非空 |
| `price` | 是 | 正整數（`Number.isInteger` 且 > 0） |
| `stock` | 是 | 非負整數 |
| `description` | 否 | 缺則存 NULL |
| `image_url` | 否 | 缺則存 NULL（注意：此欄是 **snake_case** 進 body，與多數 camelCase 輸入不一致——與現有程式碼一致） |

成功 `201`。

### PUT — Body

皆選填；有傳才覆蓋。`name` 若傳空字串 → 400；`price`／`stock` 規則同 POST。會更新 `updated_at`。

### DELETE

存在 pending 訂單關聯 → 409 `CONFLICT`「此商品存在未完成的訂單，無法刪除」。  
（已 paid／failed 的訂單不擋刪除；明細仍保留商品名價格快照。）

---

## 6. Admin Orders — `/api/admin/orders`（`adminOrderRoutes.js`）✅

### 行為概述

JWT + admin。可看全部使用者訂單。詳情額外帶下單者 `{ name, email }`。

### 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/admin/orders` | 列表（分頁＋狀態篩選） |
| GET | `/api/admin/orders/:id` | 詳情 |

### GET `/api/admin/orders` — Query

| 參數 | 預設 | 規則 |
|---|---|---|
| `page` | `1` | ≥ 1 |
| `limit` | `10` | 1～100 |
| `status` | （不過濾） | 僅當值為 `pending`／`paid`／`failed` 時才套用 WHERE；其他字串忽略 |

回傳 `data: { orders, pagination }`；orders 為完整 order 列（含 recipient_*、user_id 等）。

### GET `/api/admin/orders/:id`

`data`：order + `items` + `user`（查無使用者則 `user: null`）。不存在 → 404。

---

## 7. 頁面路由 — `/`（`pageRoutes.js`）✅

伺服器只渲染 HTML 殼；資料由前端打 API。

### 前台（`layouts/front.ejs`）

| 路徑 | 頁面 | pageScript |
|---|---|---|
| `/` | 首頁商品列表 | `index` |
| `/products/:id` | 商品詳情（locals: `productId`） | `product-detail` |
| `/cart` | 購物車 | `cart` |
| `/checkout` | 結帳 | `checkout` |
| `/login` | 登入／註冊 | `login` |
| `/orders` | 我的訂單 | `orders` |
| `/orders/:id` | 訂單詳情（locals: `orderId`、`paymentResult`←`?payment=`） | `order-detail` |

`POST /orders/:id/ecpay-return`：綠界 AIO `OrderResultURL` 落地頁（消費者瀏覽器導回，不信任其 POST body），303 導回 `/orders/:id?payment=return`，觸發前端呼叫 `/ecpay/confirm`。

### 後台（`layouts/admin.ejs`）

| 路徑 | 頁面 | pageScript |
|---|---|---|
| `/admin/products` | 商品管理 | `admin-products` |
| `/admin/orders` | 訂單管理 | `admin-orders` |

後台 HTML **無**伺服器端 JWT 檢查；靠 `Auth.requireAdmin()`。API 仍有真正授權。

---

## 8. 金流（ECPay AIO）✅（本機開發限定版）／模擬付款 ⚠️（保留）

| 項目 | 狀態 |
|---|---|
| `PATCH /api/orders/:id/pay` 模擬改狀態 | ✅（保留供測試／備用，UI 已不使用） |
| ECPay 建立訂單／導轉／CheckMacValue | ✅ `POST /api/orders/:id/ecpay/checkout`（`src/utils/ecpay.js`） |
| ECPay 主動查詢確認付款 | ✅ `POST /api/orders/:id/ecpay/confirm`（`QueryTradeInfo/V5`） |
| ECPay callback（`ReturnURL`） | ⚠️ 最小 stub `POST /api/ecpay/notify`，本機無法被觸達，非主流程 |
| 環境變數 `ECPAY_*`、`BASE_URL` | 已使用（`ECPAY_ENV=production` 才走正式環境，其餘一律走 stage） |
| Playwright E2E（真實 staging 刷卡） | ✅ `e2e/ecpay-checkout.spec.js`（`npm run test:e2e:ecpay`） |

**架構限制**：本機無法接收綠界 Server-to-Server 回呼，因此付款結果**一律由本地端主動查詢**確認，不依賴 `ReturnURL`／webhook。完整設計見 `docs/ARCHITECTURE.md` 「金流／第三方整合」與 `docs/plans/archive/2026-09-22-ecpay-integration.md`。

---

## 錯誤碼總表（跨功能）

| error | 典型 HTTP | 用途 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 缺欄位、格式錯 |
| `UNAUTHORIZED` | 401 | 未登入、token 無效、帳密錯 |
| `FORBIDDEN` | 403 | 非 admin |
| `NOT_FOUND` | 404 | 資源不存在或非擁有者（刻意當 404） |
| `CONFLICT` | 409 | Email 重複、刪商品有 pending 單 |
| `STOCK_INSUFFICIENT` | 400 | 購物車／建單庫存不足 |
| `CART_EMPTY` | 400 | 建單時購物車空 |
| `INVALID_STATUS` | 400 | 非 pending 訂單不可付款 |
| `ECPAY_CONFIG_ERROR` | 500 | 綠界環境變數未設定 |
| `ECPAY_NOT_INITIATED` | 400 | 尚未呼叫 `/ecpay/checkout` 就查詢 |
| `ECPAY_QUERY_FAILED` | 502 | 呼叫綠界 `QueryTradeInfo/V5` 失敗 |
| `ECPAY_VERIFY_FAILED` | 502 | 綠界回應 `CheckMacValue` 驗證失敗 |
| `ECPAY_MISMATCH` | 502 | 綠界回應的交易編號／金額與訂單不符 |
| `INTERNAL_ERROR` | 500（或 errorHandler） | 未預期錯誤 |

---

## 認證／授權角色對照

| 能力 | 匿名 | user | admin |
|---|---|---|---|
| 讀商品 | ✅ | ✅ | ✅ |
| 註冊／登入 | ✅ | ✅ | ✅ |
| Cart（Session） | ✅ | — | — |
| Cart（JWT） | — | ✅ | ✅ |
| 訂單 CRUD／付款 | — | ✅ | ✅ |
| Admin Products／Orders API | — | ❌ 403 | ✅ |
| Profile | — | ✅ | ✅ |
