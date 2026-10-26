# 更新紀錄（CHANGELOG）

格式依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依本專案規則（見 `docs/se/02-工作流與版本規則.md`）：
- **主版號 X**.0.0：整體大改進（架構、檔案格式、互動模型的重大變更）
- 0.**次版號 Y**.0：小幅度優化與新功能
- 0.0.**修訂號 Z**：修正 bug

## [1.0.1] - 2026-10-26
### 修正
- 「關於 Pixel Studio」顯示寫死的「0.1」，`/api/health`、MCP `serverInfo`、OpenAPI `info.version`、精靈圖 JSON `meta.version` 寫死「0.1.0」——全部改為實際版本
- e2e 測試穩定性：平行執行時多個設定共用伺服器造成專案名稱衝突、參考圖面板重繪時輸入到已移除的欄位、底部面板轉場以固定等待（改為等待轉場完成）
### 變更
- 版本單一來源為 package.json：伺服器 `server/version.js`、前端由建置產生 `public/js/version.js`
- Service Worker 快取名改為 `pixel-studio-<版本>-<內容雜湊>`，可從快取名辨識離線版本
### 新增
- `npm run e2e:par`：全矩陣 e2e 分行程平行執行
- 迴歸測試：smoke 驗證 3 個伺服器版本欄位；e2e 驗證「關於」版本與離線快取名
- 發布輔助：`work/bump.py`（同步 package/package-lock 版本）、`work/release_docs.py`（依測試結果產生 CHANGELOG／進度表／QA／版本報告）
### 測試
- smoke 54/54；e2e 18 組 3747 項通過、0 失敗

## [1.0.0] - 2026-10-26
### 基準版本
- 由原型（prototype 分支）定為 1.0.0 基準：PWA 前端（繪圖工具、圖層、cel 動畫時間軸、調色盤、匯入匯出 PNG/APNG/GIF/精靈圖/.pxs）、選用 Node 伺服器（REST API、MCP、WebSocket 同步、API 金鑰權限、活動紀錄與還原）。
- 測試基準：`npm run smoke` 51/51；`npm run e2e` iPad Pro 11／iPad 第 7 代／iPad mini 橫直向（WebKit）全數通過（見 `docs/QA測試報告.md`）。
- 新增軟體工程說明書（`docs/se/`）與 100 次迭代計畫（`docs/se/03-迭代路線圖.md`）。
