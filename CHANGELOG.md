# 更新紀錄（CHANGELOG）

格式依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依本專案規則（見 `docs/se/02-工作流與版本規則.md`）：
- **主版號 X**.0.0：整體大改進（架構、檔案格式、互動模型的重大變更）
- 0.**次版號 Y**.0：小幅度優化與新功能
- 0.0.**修訂號 Z**：修正 bug

## [1.0.0] - 2026-10-26
### 基準版本
- 由原型（prototype 分支）定為 1.0.0 基準：PWA 前端（繪圖工具、圖層、cel 動畫時間軸、調色盤、匯入匯出 PNG/APNG/GIF/精靈圖/.pxs）、選用 Node 伺服器（REST API、MCP、WebSocket 同步、API 金鑰權限、活動紀錄與還原）。
- 測試基準：`npm run smoke` 51/51；`npm run e2e` iPad Pro 11／iPad 第 7 代／iPad mini 橫直向（WebKit）全數通過（見 `docs/QA測試報告.md`）。
- 新增軟體工程說明書（`docs/se/`）與 100 次迭代計畫（`docs/se/03-迭代路線圖.md`）。
