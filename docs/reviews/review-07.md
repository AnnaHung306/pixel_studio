# 第 7 輪橫向評比與盲點搜尋（R7，迭代 31–35 之後，v1.26.0）

日期：2026-10-28　範圍：v1.23.0–v1.26.0　方法：7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart）＋網路搜尋（Pixquare App Store 頁與評論、r/gamedev 與 r/PixelArt iPad 像素藝術討論、Apple Developer Forums 的 Pointer Events／Apple Pencil Pro 討論、tldraw 與 excalidraw 的 iPad 觸控議題）。

## 1. 與 R6 相比的進展
| 項目 | R6（1.22.1） | R7（1.26.0） |
|---|---|---|
| 壓力門檻（B27） | 待排 | ✅ 1.23.0 |
| 自訂筆刷（B32） | 待排 | ✅ 1.24.0 |
| 平移縮放省合成（B20） | 待排 | ✅ 1.24.1 |
| 精靈圖影格間距（B35） | — | ✅ 1.25.0 |
| 加外框 | — | ✅ 1.26.0 |

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Pixquare 提供左手模式（介面左右對調） | App Store | 中 | B36：左手模式 |
| 2 | Pixquare 懸停預覽（Pencil Pro 懸停先看落點）；本 App 已有 hover 預覽 | App Store 評論 | 低 | 已涵蓋，實機驗證 |
| 3 | iPadOS 瀏覽器：Pencil 接觸螢幕後停止送出手指事件（Pencil＋雙指縮放無法同時） | tldraw 部落格、Apple Forums | 中 | 平台限制；B37：筆畫之間允許手勢、文件說明 |
| 4 | Pencil Pro 的 pointermove 取樣率偏低（折線感） | Apple Forums | 中 | 已用 getCoalescedEvents（B25）；實機驗證 |
| 5 | Apple Pencil 雙擊／擠壓手勢在 PWA 無 API | excalidraw issue | 低 | 平台限制，不處理 |
| 6 | 描邊是常用功能（精靈外框）；僅 4 鄰接外框 | 工作流 | 中 | B38：外框選項（8 鄰接／內框） |
| 7 | tilemap／tileset、完整索引色仍為競品核心 | 官網 | 中 | B31、B18 餘項 |

## 3. 回填 backlog
B36 iPad 左手模式；B37 iPad 筆畫間手勢（平台限制說明）；B38 新功能 外框選項（8 鄰接／內框／顏色）。

## 4. iPad 實機驗證清單（累積，迭代 50 後彙整送出）
1. 先前各項（見 review-06 §4）。
2. 「加外框」在 iPad 選單中的點擊與復原。
3. Pencil 懸停預覽與快速筆畫平滑度（Pencil Pro／M 系列）。

## 5. 待使用者決定
無。
