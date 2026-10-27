# 第 2 輪橫向評比與盲點搜尋（R2，迭代 6–10 之後，v1.7.2）

日期：2026-10-27　範圍：v1.5.0–v1.7.2　方法：延續 R1 的 7 款競品矩陣，補查 Safari 26.x 發行說明、近期 iPad 網頁繪圖回報。

## 1. 與 R1 相比的進展
| 項目 | R1（1.4） | R2（1.7.2） |
|---|---|---|
| 可收合介面／專注模式 | — | ✅（1.6.0） |
| 臨時橡皮擦／吸管 | — | ✅（1.7.0） |
| 主畫面引導／備份提醒／IDB 重連 | — | ✅（1.5.0） |
| 同點快速點畫守門 | — | ✅ e2e（1.7.1） |
| 效能基準 | — | ✅ 單元預算（1.7.2） |

仍落後 iPad 原生三強（Pixaki／Resprite／Pixquare）：索引色＋色階＋shading（B18）、tile 模式、.aseprite 匯入匯出、連結 cel、縮時匯出（B17）、Apple Pencil 壓力。

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Safari 26.4 修正「父視圖手勢辨識器擋住 touchesEnded/Cancelled 後 pointer 事件不再派發」，舊版 iPadOS 仍會卡筆畫 | Safari 26.4 release notes | 中 | B19：pointercancel／lostpointercapture 時一律結束筆畫並復原狀態＋e2e |
| 2 | iPad 最新系統上網頁繪圖出現延遲、線條被拉直（Excalidraw 回報） | github.com/excalidraw/excalidraw/issues/10976 | 中 | B20：實機量測；已使用 getCoalescedEvents（view.js），加入 rAF 批次繪製評估 |
| 3 | 使用 Apple Pencil 時 OS 不再送手指事件（無法以第二指當修飾鍵） | tldraw.dev/blog/a-touchy-subject | 低 | 設計約束：Pencil 繪圖時不依賴手指輔助；以螢幕按鈕替代 |
| 4 | Pencil 輕點兩下切換工具屬 UIPencilInteraction，網頁無法偵測 | excalidraw #10591 | 低 | 已有臨時橡皮擦按鈕（1.7.0）；不處理 |
| 5 | 壓力：e2e.pressure 陷阱——需用 pointerType==='pen' 判斷，鼠標回傳 0.5 | dev.to 2026-05 | 低 | B21：壓力→筆刷大小／透明度（選項） |
| 6 | iPadOS 26 任何網站可「以 Web App 開啟」，儲存與 Safari 分頁隔離 | firt.dev/notes/pwa-ios | 中 | 已於 1.5.0 說明＋.pxs 搬移 |

## 3. 回填 backlog
| # | 類別 | 項目 |
|---|---|---|
| B19 | iPad／bug 預防 | pointercancel／lostpointercapture 結束筆畫的守門測試 |
| B20 | 效能 | rAF 批次繪製／dirty-rect（併 B9），實機延遲量測 |
| B21 | 評比缺口 | Apple Pencil 壓力（選項） |
| B16、B17、B18 | 維持 | 等角線／靜態圖層、縮時匯出、索引色與色階 |

建議下一迭代：B19（bug 預防，優先序最高），再 B18。

## 4. iPad 實機驗證清單
1. Pencil 快速點畫同列 20 下、快速短撇：不得漏筆（Scribble 開／關各測）。
2. 專注模式：隱藏／顯示面板後畫布正確縮放、可正常繪圖。
3. 臨時橡皮擦／吸管：按住切換、放開回原工具。
4. 加入主畫面後離線開啟；備份提醒出現；.pxs 匯出存到「檔案」。
5. 手掌靠螢幕不誤畫；雙指捏合／平移；30 分鐘使用不卡頓。
6. 分割畫面／Stage Manager 縮放視窗後畫布座標仍正確。

## 5. 待使用者決定
是否更名（名稱與熱門 App 衝突）？是否部署 Zeabur 測試站供實機驗證？
