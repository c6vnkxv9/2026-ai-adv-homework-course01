# 測試規範

## 工具與整體方式

- **Vitest** + **Supertest**，對 `require('../app')` 匯出的 Express `app` 發請求（不 `listen`、不佔 port）。  
- 打**真實** `database.sqlite`：無 mock DB／bcrypt／JWT——屬 integration test。  
- 執行：`npm test`（= `vitest run`）。目前無 `test:watch`、無 coverage script。  
- `vitest.config.js`：`globals: true`（不必 import `describe`/`it`/`expect`）、`hookTimeout: 10000`。

---

## 執行順序與依賴關係

`fileParallelism: false` + 固定 `sequence.files`：

| 順序 | 檔案 | 涵蓋 | 依賴／前置假設 |
|---|---|---|---|
| 1 | `tests/auth.test.js` | 註冊、登入、profile | 可寫入 users；自建唯一 email |
| 2 | `tests/products.test.js` | 公開商品列表／詳情／分頁 | 依賴 seed 或既有 products 非空 |
| 3 | `tests/cart.test.js` | 訪客＋登入購物車 | 需至少一個真實 product id（從 GET /api/products 取） |
| 4 | `tests/orders.test.js` | 建單、列表、詳情、空車失敗 | 需 registerUser + 先加購；會扣庫存、清車 |
| 5 | `tests/ecpayPayment.test.js` | 綠界 AIO checkout/confirm、CheckMacValue 驗證、notify stub | 需 registerUser + 先加購建單；mock `global.fetch` 避免打外網 |
| 6 | `tests/adminProducts.test.js` | 後台商品 CRUD、403 | `getAdminToken()`（seed admin） |
| 7 | `tests/adminOrders.test.js` | 後台訂單列表／篩選／詳情 | admin token；`beforeAll` 內會建一筆訂單 |

**為何不能平行／亂序**：共用同一 DB、無 reset／transaction rollback。後跑的測試會看到前面留下的 users、orders、被扣過的 stock。順序錯可能導致「預期有商品／庫存」失敗。

**新增測試檔**：必須插入 `vitest.config.js` 的 `sequence.files` 合理位置（通常：被依賴的資源測試在前，admin／破壞性操作在後）。

---

## 測試檔案表

| 檔案 | 內容摘要 |
|---|---|
| `tests/setup.js` | 共用 helper（見下） |
| `tests/auth.test.js` | 註冊成功、重複 email 409、登入成功／錯密碼 401、profile 有無 token |
| `tests/products.test.js` | 列表 envelope、分頁 query、詳情、不存在 404 |
| `tests/cart.test.js` | 訪客 Session-Id CRUD；登入模式加入；不存在商品 404 |
| `tests/orders.test.js` | 從車建單、空車、未授權、列表／詳情、亂 id 404 |
| `tests/ecpayPayment.test.js` | AIO checkout 參數、confirm 依 `TradeStatus` 更新／idempotent、`CheckMacValue`／金額不符時拒絕、notify stub 永遠回 `1\|OK` |
| `tests/adminProducts.test.js` | 列表／新增／改／刪、一般 user 403、無 token 401 |
| `tests/adminOrders.test.js` | 列表、status 篩選、詳情含 items、非 admin 403 |

---

## 輔助函式（`tests/setup.js`）

```js
module.exports = { app, request, getAdminToken, registerUser };
```

### `getAdminToken()`

- `POST /api/auth/login`，email／password 寫死為 seed 預設：`admin@hexschool.com`／`12345678`  
- 回傳 `res.body.data.token`（字串）  
- **注意**：若 `.env` 改了 `ADMIN_EMAIL`／`ADMIN_PASSWORD` 且 DB 已 seed 過舊帳，此 helper 會失敗——測試假設預設 seed 帳密。

### `registerUser(overrides = {})`

| 參數 | 預設 |
|---|---|
| `overrides.email` | `test-${Date.now()}-${random}@example.com` |
| `overrides.password` | `password123` |
| `overrides.name` | `測試使用者` |

回傳 `{ token, user }`（來自 register 回應的 `data`）。用唯一 email 避免與歷史資料衝突。

### `app` / `request`

`app` 為 Express 實例；`request` 為 supertest。用法：`request(app).get('/api/...').set(...)`。

---

## 撰寫慣例

- 結構：`describe`／`it`；多用 `beforeAll` 準備 token／seed 資料。  
- **避免** `beforeEach`／`afterEach`／`afterAll` 清庫（專案沒有 teardown 工具）。  
- 唯一值：`Date.now()` + `Math.random()` 產 email，勿假設空庫。  
- 斷言順序：先 HTTP status → envelope（`data`／`error`）→ payload 內容。

### 範例（envelope 優先）

```js
const { app, request, getAdminToken } = require('./setup');

describe('Admin Orders API', () => {
  let adminToken;

  beforeAll(async () => {
    adminToken = await getAdminToken();
  });

  it('should get admin order list', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(res.body.data).toHaveProperty('pagination');
  });
});
```

### 訪客購物車 header

```js
.set('X-Session-Id', `test-session-${Date.now()}`)
```

---

## 新增測試的步驟

1. 檔名：`tests/<feature>.test.js`（camelCase）。  
2. 從 `./setup` 引入需要的 helper。  
3. 把路徑加進 `vitest.config.js` → `sequence.files`。  
4. 撰寫案例：涵蓋成功路徑 + 主要錯誤碼（401／403／404／400）。  
5. 不依賴「DB 是空的」；需要商品時先 `GET /api/products` 或 admin 建立。  
6. 執行 `npm test`，確認全套依序通過。  
7. 更新本文件的「測試檔案表」與 FEATURES（若行為有變）。

---

## 常見陷阱

1. **平行跑或漏登 sequence** → 偶發失敗、難重現。  
2. **硬編碼 product id** → seed／刪除後失效；改為測試內動態取得。  
3. **假設 stock 很大** → `orders.test` 等會扣庫存；反覆跑同一環境可能耗盡特定商品。必要時 admin API 補貨或換商品。  
4. **改 ADMIN_EMAIL 後未重建 DB** → `getAdminToken` 登入失敗。  
5. **訪客與登入車混淆** → 結帳只認 `user_id`；測試建單前必須用同一 JWT 加購。  
6. **dualAuth**：帶了壞掉的 Bearer 不會 fallback Session——測試無效 token 時不要期待訪客邏輯。  
7. **測試會持久化**：會在開發用 `database.sqlite` 留下垃圾使用者／訂單；可接受，或偶爾刪檔重建（會重跑 seed）。  
8. **不要在測試裡 `require('../server')`**：會觸發 listen／JWT 檢查；一律用 `app`。
9. **需要 mock 外部 HTTP（如綠界查詢 API）時**：直接覆寫 `global.fetch`（Node 18 內建），測試結束前用 `try/finally` 還原成原本的 `fetch`，避免污染後續測試檔；範例見 `tests/ecpayPayment.test.js` 的 `mockEcpayQueryResponse()`。
