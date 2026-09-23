# Shipping 運費計算

## User Story

身為結帳顧客，我希望依配送方式、偏遠地區與急件條件正確計算運費，並反映在訂單總額，以便付款金額與實際配送條件一致。

## Spec

### 運費規則

| 條件 | 費用 |
|---|---|
| 宅配（`home`）基本運費 | 120 |
| 超商取貨（`convenience`） | 60（**非**基本運費） |
| 商品小計 ≥ 1,500 | 免**基本**運費（僅影響宅配 120） |
| 偏遠地區 | +200 |
| 當日急件 | +250 |

### API：`POST /api/orders`

**新增 body（camelCase）**

| 欄位 | 必填 | 說明 |
|---|---|---|
| `shippingMethod` | 是 | `'home'` \| `'convenience'` |
| `isRemoteArea` | 否 | 預設 `false` |
| `isExpress` | 否 | 預設 `false`（當日急件） |

**總額**：`total_amount` = 商品小計 + `shipping_fee`

**成功回傳另含**：`shipping_fee`、`shipping_method`、`is_remote_area`、`is_express`

### 模組

`src/utils/shipping.js`：`calculateShippingFee` 等純函式，可獨立 unit test。

### DB

`orders` 新增：`shipping_method`、`shipping_fee`、`is_remote_area`、`is_express`（idempotent migration）。

## Tasks

- [x] `src/utils/shipping.js`
- [x] DB DDL + migration
- [x] 整合 `orderRoutes` 建單
- [x] 結帳前台對齊運費邏輯
- [x] `tests/shipping.test.js` + 更新建單相關測試
- [x] 更新 docs／openapi／CHANGELOG
