# 第 5 輪橫向評比與盲點搜尋（R5，迭代 21–25 之後，v1.17.0）

日期：2026-10-28　範圍：v1.13.0–v1.17.0　方法：延續 7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart），補查 2026 年 iPad 像素藝術 App 評測（beatcopgame、novaboard）、Ambersprite、Besprited、Apple Pencil Pro 開發資料（WWDC24 10214）。

## 1. 與 R4 相比的進展
| 項目 | R4（1.12.3） | R5（1.17.0） |
|---|---|---|
| tile 無縫預覽 | 待排 | ✅ 1.13.0 |
| Pencil 壓力（選項） | 待排 | ✅ 1.14.0 |
| shading ink（加深／加亮） | 待排 | ✅ 1.15.0 |
| 換色（鎖透明度）墨水 | — | ✅ 1.16.0 |
| 墊底（paint behind）墨水 | — | ✅ 1.17.0 |

仍落後：索引色模式（Aseprite 核心）、.aseprite 匯入匯出（Pixquare／Resprite／Ambersprite 有）、縮時匯出（B17）、tilemap 繪製與 Tiled 匯出（Ambersprite）、rAF 批次繪製（B20）。

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Pixaki／Pixquare 提供壓力門檻校準，避免手掌輕觸誤落點 | beatcopgame 2026-08 | 中 | B27：壓力門檻設定 |
| 2 | Pencil 傾斜（tilt）用於色階／抖色筆刷覆蓋範圍 | 同上 | 低 | B28：評估 tilt 筆刷（PointerEvent tiltX/Y） |
| 3 | Pencil Pro 擠壓開啟調色盤，使用者偏好快速色盤；網頁無擠壓事件 | WWDC24、Adobe 社群 | 低 | 以長按／浮動快速色盤替代（B29） |
| 4 | 新競品強調 Aseprite、Tiled、PSD 匯出與遊戲引擎工作流 | Ambersprite、Godot forum | 中 | B30：Tiled／.aseprite 匯出評估 |
| 5 | 全域調色盤守門（把非調色盤顏色吸附到最近色）是熱門擴充 | itch.io PaletteGuard | 中 | 併入索引色（B18 餘項） |

## 3. 回填 backlog
| # | 類別 | 項目 |
|---|---|---|
| B27 | iPad | 壓力門檻校準 |
| B28 | 新功能 | tilt 筆刷評估 |
| B29 | iPad | 快速色盤（長按／浮動） |
| B30 | 評比缺口 | .aseprite／Tiled 匯出評估 |
| B18、B20、B17 | 維持 | 建議下一迭代：索引色／調色盤吸附 |

## 4. iPad 實機驗證清單（累積，迭代 50 後彙整送出）
1. 先前各項（見 review-04 §4）。
2. Pencil 壓力開啟時輕觸是否誤落點（B27 判斷用）。
3. tile 預覽、色階／加深加亮／換色／墊底墨水用手指與 Pencil 操作。

## 5. 待使用者決定
無。
