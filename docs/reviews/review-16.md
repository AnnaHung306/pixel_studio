# 第 16 輪橫向評比與盲點搜尋（R16，迭代 76–80 之後，v1.70.0）

日期：2026-11-03　範圍：v1.66.0–v1.70.0　方法：web_search 競品近況（Resprite DA 1.32.2–1.32.6／iOS R60、Pixquare 2.73.4、Pixel Studio(Steam) 5.54、voidsprite 2026.10、SpriteCook 編輯器）。

## 1. 競品近況
| 項目 | 競品動態 | Pixel Studio 1.70.0 |
|---|---|---|
| 檔案 | Steam Pixel Studio 5.54 加 Aseprite 匯出；SpriteCook 編輯器支援 .aseprite；Pixquare 持續更新 .aseprite 規格 | 仍無 .aseprite（B77），缺口擴大 |
| 筆壓 | Resprite 1.32.x 壓力控制筆刷大小 | 已有筆壓（v1.14.0），可檢視筆刷大小映射 |
| 動畫 | Resprite 多格變形、繼承格補間；Steam 版加影格群組 | 已有全影格翻轉／旋轉；無補間（B76）、無影格群組 |
| 工具列 | Resprite 工具列／動作列按鈕大小可獨立調整 | 已有介面縮放（v1.66.0） |
| 調色盤 | voidsprite 調色盤管理器（隱藏、分區） | 無分區（B80） |
| 文字 | Pixquare 未套用文字自動保存、AA 關閉預覽加強 | 已有對齊；未套用文字保存待檢查 |
| 自動化 | Steam 版 MCP（Beta）、AI 調色盤 | 已有 REST＋MCP 伺服器 |

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | .aseprite 互通成為多家標配 | Steam 5.54、SpriteCook、Pixquare | 高 | B77 提升優先 |
| 2 | 影格群組 | Steam 5.54 | 低 | B85 |
| 3 | 筆壓控制筆刷大小映射曲線 | Resprite 1.32 | 低 | B86 |
| 4 | 未套用文字在切換／關閉時保存 | Pixquare 2.73.4 | 中 | B87 |

## 3. Backlog 檢討
仍有值得做的改進（B76、B77、B80、B85–B87），無需提前結束。下一步：迭代 81 優先 B77 .aseprite 匯出，或 B87。

## 4. iPad 實機驗證清單（累積）
沿用 review-14 §4。

## 5. 待使用者決定
無。
