# 第 6 輪橫向評比與盲點搜尋（R6，迭代 26–30 之後，v1.22.1）

日期：2026-10-28　範圍：v1.18.0–v1.22.1　方法：7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart）＋2026 年 8–10 月 iPad 像素藝術評測（beatcopgame、the-pixel.art、Guideflow、Pixquare／Pixaki 官網、Reddit r/gamedev）。

## 1. 與 R5 相比的進展
| 項目 | R5（1.17.0） | R6（1.22.1） |
|---|---|---|
| 鎖定調色盤吸附 | 待排 | ✅ 1.18.0 |
| 轉換為調色盤顏色 | — | ✅ 1.19.0 |
| 反相／灰階／色相偏移 | — | ✅ 1.20.0–1.21.0 |
| 快速色盤（B29） | 待排 | ✅ 1.22.0 |

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Pixaki／Pixquare 皆有 tilemap／tileset 系統，為遊戲開發者主要賣點 | beatcopgame、Reddit | 高 | B31：tilemap 評估 |
| 2 | Pixquare 有自訂筆刷、多重選取 | Reddit r/gamedev | 中 | B32：自訂筆刷（由選取範圍建立） |
| 3 | Pixquare 手勢板（gesture pad）、時間縮放錄影；Aseprite 檔雙向相容 | pixquare.art | 中 | B30、B17 維持 |
| 4 | Pixaki 有 PSD 匯出（每影格圖層成群組） | pixaki.com | 低 | B33：PSD 匯出評估 |
| 5 | Ambersprite：手指可設為僅導覽、Pencil 才繪圖 | nav-ai 評測 | 中 | B34：手指僅導覽模式（確認現有手掌防誤觸是否已涵蓋） |
| 6 | 完整索引色模式仍為 Aseprite／Pixquare 核心 | 官網 | 中 | B18 餘項 |

## 3. 回填 backlog
B31 評比缺口 tilemap 評估；B32 新功能 自訂筆刷；B33 評比缺口 PSD 匯出評估；B34 iPad 手指僅導覽模式。建議下一迭代：B34／B27（iPad 體驗優先）。

## 4. iPad 實機驗證清單（累積，迭代 50 後彙整送出）
1. 先前各項（見 review-05 §4）。
2. 快速色盤按鈕位置是否遮擋畫面、色塊手指點擊手感。
3. 調色盤吸附／轉換／反相／灰階操作後復原是否正確。

## 5. 待使用者決定
無。
