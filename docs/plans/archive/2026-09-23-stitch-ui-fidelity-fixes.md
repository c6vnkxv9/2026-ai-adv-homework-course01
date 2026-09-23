# Stitch UI 精細比對修正

## 背景

「花市價籤」視覺（ink/paper/peony/marigold/moss、tag-corner 卡片、Noto Serif TC）已在先前 session 完成並 commit（`ec47ac7`），且與 Stitch 專案（`projects/6278936829933410990`）的 design system 完全一致。本次任務為逐頁對照 Stitch 截圖，找出殘留的像素級落差並修正。

## 比對結論

用 Playwright 截了 5 個即時頁面（首頁／商品詳情／購物車／登入／404），與 Stitch 的 5 張設計截圖逐一比對。大部分落差是**刻意省略的假功能**（LINE／Google 登入、優惠代碼輸入、「記住我」30 天、多組行銷導覽項目如花市地圖／蒔藝服務）——這些在後端 API 沒有對應支援，維持不做才符合「不要硬編碼 placeholder」的規範。

真正可修的落差：

1. **商品詳情頁**缺少「你可能也喜歡」相關商品區塊（Stitch 有，且可用既有 `GET /api/products` 資料實作，不需改 API）。
2. **購物車頁**在 Stitch 是雙欄（商品列表 + 右側 sticky 結帳摘要），現況是單欄堆疊。
3. **登入頁**在 Stitch 卡片上方有簡短品牌語氣的 hero 標題，現況直接是卡片，稍嫌單薄。

## 修改範圍

- `views/pages/product-detail.ejs` + `public/js/pages/product-detail.js`：新增相關商品區塊，抓 `/api/products?limit=5`，過濾掉目前商品，取前 3 筆。
- `views/pages/cart.ejs`：改為 `lg:` 斷點雙欄版面（商品列表 `lg:col-span-3` + 摘要 `lg:col-span-2 lg:sticky`），手機維持單欄堆疊。
- `views/pages/login.ejs`：卡片上方新增一段 hero 文案（沿用首頁 serif 兩行標題語氣），不加社群登入／記住我等假功能。

## 不做

- 不加 LINE／Google OAuth 按鈕、優惠代碼輸入、「記住我」勾選框（無對應 API）。
- 不加多組行銷導覽項目（花市地圖、蒔藝服務等無對應頁面）。
- 不改商品圖片為多圖 gallery（`products.image_url` 只有單欄位，不改 DB schema）。
