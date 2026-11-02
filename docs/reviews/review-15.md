# 第 15 輪橫向評比與盲點搜尋（R15，迭代 71–75 之後，v1.65.0）

日期：2026-11-02　範圍：v1.61.0–v1.65.0　方法：web_search 競品近況（Resprite DA 1.32.x／iOS R60、Pixquare 2.73.x、Aseprite 1.3.18.4、voidsprite 2026.10、Pixelorama 1.2.3）。

## 1. 競品近況
| 項目 | 競品動態 | Pixel Studio 1.65.0 |
|---|---|---|
| 文字 | Pixquare 2.73.4 文字工具新增對齊 | 已有文字工具（字型、輪廓、陰影、直排、斜體）；對齊待確認 |
| 介面 | voidsprite UI 縮放 50–300%；Resprite 工具列按鈕大小可調 | 固定 44pt 目標，無介面縮放 |
| 調色盤 | voidsprite 調色盤管理器（隱藏、分區、命名）；Resprite 調色盤排序 | 已有排序／反轉／去重／色名；無分區 |
| 檔案 | Pixquare／Pixelorama 皆可 .aseprite 匯出入；Roblox 一鍵匯入 .ase | 無 .aseprite（B77） |
| 對稱 | Resprite 修正鏡像選取變形後像素不一致 | 待檢查選取變形與對稱互動 |
| 動畫 | Resprite 繼承格補間 | 無（B76） |

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | 文字工具缺左／中／右對齊（多行） | Pixquare 2.73.4 | 中 | B78 |
| 2 | 介面整體縮放（iPad 大小手指／視力） | voidsprite | 中 | B79 |
| 3 | 調色盤分區／隱藏 | voidsprite | 低 | B80 |
| 4 | .aseprite 互通仍為最大缺口 | 多家 | 中 | B77 |

## 3. Backlog 檢討
仍有值得做的改進（B73–B80），無需提前結束。下一步：迭代 76 先做 B78 文字對齊。

## 4. iPad 實機驗證清單（累積）
沿用 review-14 §4。

## 5. 待使用者決定
無。
