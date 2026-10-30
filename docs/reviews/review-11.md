# 第 11 輪橫向評比與盲點搜尋（R11，迭代 51–55 之後，v1.46.0）

日期：2026-10-30　範圍：v1.42.0–v1.46.0　方法：7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart）＋網路搜尋（Pixquare App Store 評論與文件、r/gamedev iOS 像素 App 比較、Aseprite 社群行動版討論、Safari 26.2 發行說明、Excalidraw 觸控問題彙整）。

## 1. 與 R10 相比的進展
| 項目 | R10（1.41.0） | R11（1.46.0） |
|---|---|---|
| 色盤顏色命名（B51） | 待排 | ✅ 1.43.0 |
| 漸層抖動樣式（B53） | 待排 | ✅ 1.42.0 |
| 色盤排序／移除重複／反轉（B54–B56） | — | ✅ 1.44.0–1.46.0 |
| 文字工具（B47） | 待排 | 待排 |

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | 「只用 Apple Pencil 繪圖」設定：手指專供導覽，防手掌誤觸 | Pixquare 繪圖設定文件 | 中–高 | B57：Pencil-only 模式 |
| 2 | 大倍率匯出在舊 iPad 記憶體不足 | Pixquare 開發者回覆 | 低 | 本專案已有 limitScale 自動降倍率（優勢） |
| 3 | 縮時錄影、Color Replacer（取代色）仍為賣點 | Pixquare 使用者評價 | 中 | B44 待排；取代色已有（重新著色墨水／調色盤轉換） |
| 4 | 繪圖時雙指點按復原在 PWA 常缺 | Excalidraw 觸控彙整 #7979 | — | 本專案 1.38.0 已具備（優勢） |
| 5 | Safari 26.2 Pointer Events 座標改為小數 | Safari 26.2 發行說明 | 低 | 座標已 floor；B58：加小數座標單元測試 |
| 6 | Aseprite 無行動版計畫 | Aseprite 社群 | — | 市場空缺，維持定位 |

## 3. Backlog 檢討
新增 B57（Pencil-only 模式，iPad 優先）、B58（小數座標測試）。其餘待排多為大型項目。仍有值得做的改進，無需提前結束。

## 4. iPad 實機驗證清單（累積）
1. 先前各項（見 review-10 §4）。
2. 調色盤排序／移除重複／反轉操作。
3. 日後 Pencil-only 模式的手掌防誤觸。

## 5. 待使用者決定
無。
