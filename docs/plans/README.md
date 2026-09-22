# plans/ 資料夾說明

開發過程中的計畫與決策紀錄（過程文件）。長期有效的結論必須回寫進正式文件。

## 使用方式

1. 較大功能開始前，在本目錄新增計畫檔。
2. 開發中若決策改變，更新同一份檔案。
3. **完成後**：
   - 將檔案**移至** [`archive/`](./archive/)
   - 回寫 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)、[`../DEVELOPMENT.md`](../DEVELOPMENT.md)、[`../FEATURES.md`](../FEATURES.md)、[`../TESTING.md`](../TESTING.md)（視變更範圍）
   - 更新 [`../FEATURES.md`](../FEATURES.md) 狀態與 [`../CHANGELOG.md`](../CHANGELOG.md)

## 檔名

`YYYY-MM-DD-<feature-name>.md`  
例：`2026-09-22-ecpay-integration.md`

## 文件結構

```markdown
# <功能標題>

## User Story
As a <角色>, I want <目標>, so that <價值>。

## Spec
- API／權限／資料模型
- 錯誤與邊界情境
- UI（若有）

## Tasks
- [ ] 任務 1
- [ ] 任務 2
```

也可加上 **決策／取捨**、**影響範圍** 小節。

## archive/

已完成計畫存放處。勿刪歷史檔；正式文件以 FEATURES／ARCHITECTURE 等為準。

目前尚無進行中的計畫；下一次開發請在此建立第一份紀錄。
