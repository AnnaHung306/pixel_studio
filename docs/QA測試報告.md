# Pixel Studio QA 測試報告（iPad／iPhone／桌面）

日期：2026-10-25　範圍：前端 PWA（`public/`）、本機伺服器（REST `/api/v1`、MCP `/mcp`、WebSocket 同步）

## 測試方法

- Linux 上沒有 Xcode iOS 模擬器，改用最接近的方式：**Playwright WebKit 27.2（Safari 的引擎）** 搭配 Playwright 的裝置設定（螢幕尺寸、DPR、`hasTouch`、`isMobile`、iPad／iPhone UA），以及 **Chromium 156** 1920×1080 代表 Windows 桌面。
- 每個裝置設定都跑兩個目標：**完整伺服器**（`npm start`）與 **純靜態 `dist/`**（無後端）。
- 畫布操作以頁面內合成的 `PointerEvent`（`pointerType` = `touch`／`pen`／`mouse`，含多指）驅動；按鈕、選單、對話框用 Playwright 的實際觸控 `tap()`（桌面用 `click()`）；桌面另用真實滑鼠拖曳、滾輪、右鍵與鍵盤。
- 所有匯出檔都在 Node 端解碼驗證（PNG／APNG 區塊與透明度、GIF 影格與延遲、ZIP 內容、精靈圖 JSON、.pxs）。
- 每個測試組結束都檢查：console error／warning、頁面例外、失敗的請求、HTTP ≥ 400。
- 可重複執行：`npm run e2e`（腳本 `scripts/e2e.js`）。

## 最終結果（全部通過）

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | WebKit | 213 ✅ | 192 ✅ |
| iPad Pro 11 直向 | WebKit | 211 ✅ | 192 ✅ |
| iPad（第 7 代）橫向 | WebKit | 211 ✅ | 192 ✅ |
| iPad（第 7 代）直向 | WebKit | 211 ✅ | 192 ✅ |
| iPad mini 橫向 | WebKit | 211 ✅ | 192 ✅ |
| iPad mini 直向 | WebKit | 211 ✅ | 192 ✅ |
| iPhone 14 直向 | WebKit | 224 ✅（分兩段執行） | 204 ✅ |
| iPhone 14 橫向 | WebKit | 224 ✅（分兩段執行） | 204 ✅ |
| 桌面 1920×1080 | Chromium | 231 ✅ | 212 ✅ |

`npm run smoke`：51／51 通過。所有設定的 Service Worker 皆為 active，斷網重新整理可從快取開啟。

## 發現並修正的問題

| # | 問題 | 影響 | 修正 |
|---|---|---|---|
| 1 | `setPointerCapture` 在指標已失效時丟出例外（WebKit：「The object can not be found here.」；Chromium：NotFoundError） | 例外中斷 `pointerdown` 處理：筆畫、捏合、圖層拖曳、顏色拖曳都無法開始（極快速點按或 pointercancel 競態時會發生） | `dom.js` 新增 `capture()`（try/catch），view／panels／main 全部改用 |
| 2 | `html, body { touch-action: none }`：touch-action 會與所有祖先取交集 | 側邊欄、時間軸、iPhone 工具列、選項列、對話框、選單都**無法用手指捲動** | body 改 `manipulation`（仍禁止雙擊放大）；只有畫布、色彩方塊、把手用 `none`；捲動容器 `pan-x pan-y` + `overscroll-behavior: contain` |
| 3 | iPhone 直向頂端列超出螢幕 | **伺服器／AI 按鈕被擠出畫面外**，專案名稱只剩 16px | 手機版緊湊頂端列；≤430px 隱藏縮放百分比（選單新增「檢視 → 符合視窗／放大」） |
| 4 | 只處理上方 safe-area | iPhone 橫向時瀏海遮住工具列 | `#app`、底部面板、對話框加上左右／下方 `env(safe-area-inset-*)` |
| 5 | Safari／WebKit 原生 `<select>` 外觀 | 淺色底＋淺色字，**下拉選單文字幾乎看不見**（匯出格式、抖動、播放模式…） | 自訂 `appearance: none` 樣式與箭頭 |
| 6 | iPhone 時間軸的下拉選單被 flex 壓扁成細條，按鈕藏在橫向捲動後 | 播放模式／範圍無法操作 | 工具列子元素 `flex: none`；手機版時間軸控制列自動換行 |
| 7 | 「畫布大小」對話框的 ×2／×3／×4 直接移除 DOM，Escape 監聽器殘留 | **之後 Esc 永遠被吞掉**（無法取消選取、取消貼上） | `modal()` 關閉改為冪等、對話框被移除時自動解除監聽；按鈕改呼叫 `dlg.close()` |
| 8 | 純靜態部署每次開啟都對 `api/health` 產生 404 | console error；離線開啟時還會有網路錯誤 | 伺服器回應加 `X-Pixel-Studio` 標頭，前端先 `HEAD ./` 判斷；離線時不偵測 |
| 9 | iOS 檔案選擇器 `accept=".pxs,.gpl,.hex"` | iOS 無法對應的副檔名會**變灰無法選取** | iOS 上這類選擇器不過濾，選取後驗證內容；加上 `oncancel` |
| 10 | 精靈圖匯出 PNG 後延遲 400ms 再下載 JSON | iOS Safari 一次點擊只允許一個下載，**JSON 會被擋** | iOS 上自動打包成單一 ZIP |
| 11 | iOS 主畫面 App（standalone）沒有 blob 下載介面 | 匯出後無法存檔 | standalone 模式改用 Web Share（檔案），失敗時退回一般下載 |
| 12 | 只在畫布上取消 `gesturestart` | 在工具列上捏合會**縮放整個頁面**（iOS 忽略 `user-scalable=no`） | 在 document 上取消 `gesturestart/change/end` |
| 13 | 介面可被選取文字 | 長按色塊、影格編號時出現 iOS 放大鏡／選取框 | 介面 `user-select: none`、`-webkit-touch-callout: none`（輸入框除外） |
| 14 | 手指／筆離開後筆刷游標殘留 | 畫面上留下假的游標框 | 非滑鼠 `pointerup` 時清除 hover |
| 15 | iOS `100vh` 包含網址列 | 底部面板／對話框可能被切掉 | 加上 `dvh` 備援 |
| 16 | 底部面板把手只有 5px 高 | 很難用手指滑動收起 | 觸控範圍加大到 22px |
| 17 | 未要求持久儲存 | 瀏覽器在空間不足時可能清除 IndexedDB | 啟動時 `navigator.storage.persist()`；說明書提醒 Safari 7 天政策 |
| 18 | 冒煙測試伺服器啟動等待只有 5 秒 | 機器忙碌時偶發失敗 | 延長到 20 秒 |

對照：用原始版本跑同一套測試，iPhone 14 直向在 boot／layout／draw／history 就有 11 項失敗、iPad mini 直向有 9 項失敗（上表 1–4、8 等），修正後全部通過。

## 無法在此環境驗證的項目

- **真正的 Apple Pencil**（硬體防誤觸、懸停、延遲手感）——只能用 `pointerType: "pen"` 模擬。
- **真正的 iPadOS／iOS Safari**：實際的下載提示與「檔案」App、主畫面 App 的分享面板、真實 `accept` 行為、ITP 7 天清除、鍵盤彈出時的視窗變化、真實瀏海的 safe-area 數值（以 CSS 變數模擬 44／34px）。
- 在 Linux WebKit 中，iPad 設定的 Playwright `touchscreen.tap()` 不會產生 pointer 事件（iPhone 橫向會），因此畫布以合成 PointerEvent 測試；按鈕的觸控點按為真實事件。
- `navigator.maxTouchPoints` 在 Playwright WebKit 為 0（實機為 5），iOS 判斷依 UA。
- 真實 Windows（以 Linux 上的 Chromium 代表）、macOS Safari、Firefox 未測。
- 區網連線、Windows／macOS 防火牆、mkcert HTTPS 憑證安裝流程。
- 實機效能（大畫布、多影格）。
