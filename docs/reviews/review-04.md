# 第 4 輪橫向評比與盲點搜尋（R4，迭代 16–20 之後，v1.12.3）

日期：2026-10-27　範圍：v1.11.0–v1.12.3　方法：延續 R1–R3 的 7 款競品矩陣（Aseprite、Pixaki、Resprite、Pixquare、Piskel、Lospec Pixel Editor、Pixilart），補查 Safari 26.4 發行說明、WebKit 217430、Apple 開發者論壇與 Pencil 事件回報。

## 1. 與 R3 相比的進展
| 項目 | R3（1.10.0） | R4（1.12.3） |
|---|---|---|
| 調色盤色階（ramp） | 待排 | ✅ 1.11.0 |
| < / > 明暗一階 | — | ✅ 1.12.0 |
| pointercancel 後筆畫接續（B23） | 待排 | ✅ 1.12.1 |
| Scribble touchmove 守門（B22） | 待排 | ✅ 1.12.2 |
| 小數座標單元測試（B24） | 待排 | ✅ 1.12.3 |

仍落後：索引色模式與 shading ink（B18 餘項）、tile 無縫預覽（Piskel／Lospec／Pixilart 有）、.aseprite 匯入匯出、連結 cel、縮時匯出（B17）、Pencil 壓力（B21）、rAF 批次繪製（B20）。

## 2. 新盲點
| # | 發現 | 來源 | 影響 | 處置 |
|---|---|---|---|---|
| 1 | Pencil Pro 上 pointermove 取樣疑似低於 touchmove，快速曲線呈折線；getCoalescedEvents 可補回子樣本（需實機確認支援度） | Apple forums 776468、DEV 文章 | 中 | B25：有 getCoalescedEvents 時逐點補線，無則維持；實機驗證 |
| 2 | Safari 26.4 修正 iPadOS 關閉側邊欄／縮放視窗後頁面殘留放大 | Safari 26.4 notes | 低 | 視窗縮放 e2e 已涵蓋；實機驗證 |
| 3 | WebKit 217430（Scribble 吞事件）在新版仍有回報，社群解法同 touchmove preventDefault | flutter #172865、tldraw #5813 | 高（已防） | 1.12.2 守門測試已在 |
| 4 | 低電量模式下 Pencil 取樣降為 120Hz | Apple forums 689375 | 低 | 文件註記 |
| 5 | 無縫 tile 預覽是網頁競品的常用功能 | Piskel／Lospec | 中 | B26：tile 預覽模式 |

## 3. 回填 backlog
| # | 類別 | 項目 |
|---|---|---|
| B25 | iPad | getCoalescedEvents 補點，快速筆畫更平滑 |
| B26 | 評比缺口 | 無縫 tile 預覽 |
| B18、B20、B21、B17 | 維持 | 建議下一迭代 B26 或 B18 餘項 |

## 4. iPad 實機驗證清單（累積，迭代 50 後彙整送出）
1. Pencil 快速點畫同列 20 下、快速短撇（Scribble 開／關）。
2. 專注模式、臨時橡皮擦／吸管、長按吸色手感。
3. Shift（外接鍵盤）等角線；< / > 明暗一階；色階產生。
4. pointercancel 後筆畫接續（手掌誤觸情境）。
5. 加入主畫面後離線開啟、備份提醒、.pxs 存到「檔案」。
6. 分割畫面／Stage Manager 縮放後座標與縮放正確（Safari 26.4）。
7. 快速曲線是否呈折線（B25 判斷用）。

## 5. 待使用者決定
無。
