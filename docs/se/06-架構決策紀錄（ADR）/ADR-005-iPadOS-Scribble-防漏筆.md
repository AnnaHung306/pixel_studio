# ADR-005：繪圖面以 non-passive touchmove preventDefault 防止 iPadOS Scribble 吃掉筆畫
- 狀態：採納（1.4.0）
- 背景：iPadOS 的「隨手寫（Scribble）」在系統層監看 Apple Pencil，會攔截快速的 pointerdown／pointerup，造成快速點畫或短撇每隔一筆就漏畫（WebKit Bug 217430；2025–2026 年 Flutter #172865、BlockSuite 等專案仍回報可重現）。`touch-action: none`、`user-select: none` 都無效；已知有效的解法是在目標元素加 non-passive `touchmove` 並 `preventDefault()`。
- 決定：`dom.js claimPencil(el)` 只套用在繪圖面（主畫布、取色器 SV 面板與色條）；可捲動的面板（側欄、時間軸、對話框）不套用，以免失去原生捲動。
- 驗證：e2e `diag` 組檢查畫布／取色器會取消 touchmove、面板不會，並以 8 次快速 pen 點擊確認全部上色；真正的 Scribble 行為只能實機驗證（列入實機清單第 1 項）。
