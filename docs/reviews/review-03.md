# 第 3 輪橫向評比與盲點搜尋（R3，迭代 11–15 之後，v1.10.0）

日期：2026-10-27　範圍：v1.7.4–v1.10.0　方法：延續 R1/R2 的 7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart），補查 Pointer Events 規格、Safari 26.2／26.4 發行說明與近期 iPad Pencil 回報。

## 1. 與 R2 相比的進展
| 項目 | R2（1.7.2） | R3（1.10.0） |
|---|---|---|
| pointercancel／lostpointercapture 守門 | 待排 | ✅ 1.7.4 |
| 等角 2:1 直線（Shift） | — | ✅ 1.8.0 |
| 對稱／抖動偏好記憶 | — | ✅ 1.8.1 |
| 長按吸色（Procreate 慣例）＋可調延遲／關閉 | — | ✅ 1.9.0／1.10.0 |

仍落後：索引色＋色階＋shading ink（B18）、tile 無縫模式、.aseprite 匯入匯出、連結 cel、縮時匯出（B17）、Apple Pencil 壓力（B21）、rAF 批次繪製（B20）。Piskel／Lospec／Pixilart 在網頁端已有 tile 預覽與調色盤庫，是我們最明顯的功能缺口。

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Scribble 仍可能吞掉快速 pointerdown/up（WebKit 217430 在新版 iPadOS 仍重現）；社群解法為對 touchmove 呼叫 preventDefault | flutter/flutter #172865、tldraw #5813 | 高 | B22：確認 view.js 已有 touchmove preventDefault，補 e2e 守門（1.4.0 已有部分處理） |
| 2 | Pencil 偶發筆畫中途停止收事件、疑為 pointercancel／捕捉遺失 | react-sketch-canvas #211 | 中 | B23：pointercancel 後保留已畫筆畫並可無縫接續；實機驗證 |
| 3 | Pencil 繪圖時 OS 不送手指事件，雙指手勢不可用 | excalidraw #7979、Apple forums 773213 | 低 | 設計約束，已有螢幕按鈕替代 |
| 4 | canvas `desynchronized: true` 可降低渲染延遲 | Apple forums 689375 | 低 | B20 併入評估 |
| 5 | Safari 26.2 起 pointer 座標為小數 | Safari 26.2 notes | 低 | 座標換算已 floor；單元測試已涵蓋，補小數案例（B24） |
| 6 | Pencil 懸停預覽（HIG 建議）網頁無法用 | Apple HIG | 低 | 以游標格預覽替代，不處理 |

## 3. 回填 backlog
| # | 類別 | 項目 |
|---|---|---|
| B22 | iPad／bug 預防 | Scribble 快速點畫：touchmove preventDefault 守門 e2e |
| B23 | iPad | pointercancel 後筆畫保留與接續 |
| B24 | 品質 | 小數 pointer 座標單元測試 |
| B18、B20、B21、B17 | 維持 | 建議下一迭代 B18（最大功能缺口） |

## 4. iPad 實機驗證清單（累積，迭代 50 後彙整送出）
1. Pencil 快速點畫同列 20 下、快速短撇（Scribble 開／關）。
2. 專注模式切換後畫布縮放與繪圖。
3. 臨時橡皮擦／吸管按住切換。
4. 長按吸色 0.4／0.6／0.9 秒手感；關閉後不誤觸。
5. Shift（外接鍵盤）等角線。
6. 加入主畫面後離線開啟、備份提醒、.pxs 存到「檔案」。
7. 手掌靠螢幕不誤畫；分割畫面／Stage Manager 縮放後座標正確。

## 5. 待使用者決定
無。
