# Pixel Studio QA 測試報告（iPad／iPhone／桌面）

日期：2026-10-25　範圍：前端 PWA（`public/`）、本機伺服器（REST `/api/v1`、MCP `/mcp`、WebSocket 同步）

# 版本測試紀錄（最新在上）

<!-- latest -->

## v1.25.0（2026-10-28，迭代 34）

smoke 54/54；e2e 18 組 6871 項通過、0 失敗；單元測試 54/54（smoke）；npm test 通過（40）。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPhone 14 直向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 393 ✅ | 374 ✅ |

單元 sheetGeometry 新增 2 項；e2e export 組回歸。


## v1.24.1（2026-10-28，迭代 33）

smoke 54/54；e2e 18 組 6871 項通過、0 失敗；單元測試 smoke 與 npm test 通過。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPhone 14 直向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 393 ✅ | 374 ✅ |

既有 e2e 全矩陣驗證繪圖／平移縮放行為不變。


## v1.24.0（2026-10-28，迭代 32）

smoke 54/54；e2e 18 組 6871 項通過、0 失敗；單元測試 54/54（smoke）；npm test 通過（38）。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 橫向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPad mini 直向 | webkit 27.2 | 387 ✅ | 368 ✅ |
| iPhone 14 直向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 403 ✅ | 384 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 393 ✅ | 374 ✅ |

e2e custombrush 新增 6 項。


## v1.23.0（2026-10-28，迭代 31）

smoke 54/54；e2e 18 組 6781 項通過、0 失敗；單元測試 54/54（smoke）；npm test 通過（38）。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPad mini 橫向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPad mini 直向 | webkit 27.2 | 382 ✅ | 363 ✅ |
| iPhone 14 直向 | webkit 27.2 | 398 ✅ | 379 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 398 ✅ | 379 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 388 ✅ | 369 ✅ |

e2e pressure 新增 2 項。


## v1.22.0（2026-10-28，迭代 30）

smoke 54/54；e2e 18 組 6743 項通過、0 失敗；單元測試 54/54（smoke）；npm test 通過。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 380 ✅ | 361 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 380 ✅ | 361 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 380 ✅ | 361 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 380 ✅ | 361 ✅ |
| iPad mini 橫向 | webkit 27.2 | 380 ✅ | 361 ✅ |
| iPad mini 直向 | webkit 27.2 | 380 ✅ | 359 ✅ |
| iPhone 14 直向 | webkit 27.2 | 396 ✅ | 377 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 396 ✅ | 377 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 386 ✅ | 367 ✅ |

e2e quick 新增 3 項。


## v1.21.0（2026-10-27，迭代 29）

smoke 54/54；e2e 18 組 6691 項通過、0 失敗；單元測試 54/54（smoke）；npm test 通過。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPad mini 橫向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPad mini 直向 | webkit 27.2 | 377 ✅ | 358 ✅ |
| iPhone 14 直向 | webkit 27.2 | 393 ✅ | 374 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 393 ✅ | 374 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 383 ✅ | 364 ✅ |

e2e grayhue 新增 4 項。


## v1.20.0（2026-10-27，迭代 28）

smoke 54/54；e2e 18 組 6601 項通過、0 失敗；單元測試 54/54（npm test）。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPad mini 橫向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPad mini 直向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPhone 14 直向 | webkit 27.2 | 388 ✅ | 369 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 388 ✅ | 369 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 378 ✅ | 359 ✅ |

e2e invert 新增 3 項。


## v1.19.0（2026-10-27，迭代 27）

smoke 54/54；e2e 18 組 6529 項通過、0 失敗；單元測試 36/36。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPad mini 橫向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPad mini 直向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPhone 14 直向 | webkit 27.2 | 384 ✅ | 365 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 384 ✅ | 365 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 374 ✅ | 355 ✅ |

e2e palconvert 新增 6 項。


## v1.18.0（2026-10-27，迭代 26）

smoke 54/54；e2e 18 組 6439 項通過、0 失敗；單元測試 36/36。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPad mini 橫向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPad mini 直向 | webkit 27.2 | 363 ✅ | 344 ✅ |
| iPhone 14 直向 | webkit 27.2 | 379 ✅ | 360 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 379 ✅ | 360 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 369 ✅ | 350 ✅ |

e2e palettelock 新增 2 項。


## v1.17.0（2026-10-27，迭代 25）

smoke 54/54；e2e 18 組 6385 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPad mini 橫向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPad mini 直向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPhone 14 直向 | webkit 27.2 | 376 ✅ | 357 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 376 ✅ | 357 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 366 ✅ | 347 ✅ |

e2e shadeink 新增 2 項。


## v1.16.0（2026-10-27，迭代 24）

smoke 54/54；e2e 18 組 6349 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPad mini 橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPad mini 直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPhone 14 直向 | webkit 27.2 | 374 ✅ | 355 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 374 ✅ | 355 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 364 ✅ | 345 ✅ |

e2e shadeink 新增 2 項。


## v1.15.0（2026-10-27，迭代 23）

smoke 54/54；e2e 18 組 6313 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPad mini 橫向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPad mini 直向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPhone 14 直向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 372 ✅ | 353 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 362 ✅ | 343 ✅ |

e2e 新增 shadeink 組 5 項檢查。


## v1.14.0（2026-10-27，迭代 22）

smoke 54/54；e2e 18 組 6241 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPad mini 橫向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPad mini 直向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPhone 14 直向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 368 ✅ | 349 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 358 ✅ | 339 ✅ |

e2e 新增 pressure 組 3 項檢查。


## v1.13.0（2026-10-27，迭代 21）

smoke 54/54；e2e 18 組 6187 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPad mini 橫向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPad mini 直向 | webkit 27.2 | 349 ✅ | 330 ✅ |
| iPhone 14 直向 | webkit 27.2 | 365 ✅ | 346 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 365 ✅ | 346 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 355 ✅ | 336 ✅ |

新增 tile e2e 組。


## v1.12.3（2026-10-27，迭代 20）

smoke 54/54；e2e 18 組 6097 項通過、0 失敗；單元測試 35/35。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad mini 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad mini 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPhone 14 直向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 350 ✅ | 331 ✅ |

單元測試新增 5 項檢查。


## v1.12.2（2026-10-27，迭代 19）

smoke 54/54；e2e 18 組 6097 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad mini 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPad mini 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPhone 14 直向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 360 ✅ | 341 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 350 ✅ | 331 ✅ |

e2e diag 組新增 1 項檢查。


## v1.12.1（2026-10-27，迭代 18）

smoke 54/54；e2e 18 組 6077 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPad mini 橫向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPad mini 直向 | webkit 27.2 | 343 ✅ | 324 ✅ |
| iPhone 14 直向 | webkit 27.2 | 357 ✅ | 340 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 359 ✅ | 340 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 349 ✅ | 330 ✅ |

e2e taps 組改 1 項、新增 1 項檢查。


## v1.12.0（2026-10-27，迭代 17）

smoke 54/54；e2e 18 組 6061 項通過、0 失敗；單元測試 34/34。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPhone 14 直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 348 ✅ | 329 ✅ |

單元測試 ramp 新增 shadeStep（1 項）。


## v1.11.0（2026-10-27，迭代 16）

smoke 54/54；e2e 18 組 6061 項通過、0 失敗；單元測試 32/32。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPhone 14 直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 348 ✅ | 329 ✅ |

單元測試新增 ramp（2 項）。


## v1.10.0（2026-10-27，迭代 15）

smoke 54/54；e2e 18 組 6061 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 橫向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPad mini 直向 | webkit 27.2 | 342 ✅ | 323 ✅ |
| iPhone 14 直向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 358 ✅ | 339 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 348 ✅ | 329 ✅ |

longpress 組增至 7 項檢查。


## v1.9.0（2026-10-27，迭代 14）

smoke 54/54；e2e 18 組 6025 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPad mini 橫向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPad mini 直向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPhone 14 直向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 356 ✅ | 337 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 346 ✅ | 327 ✅ |

e2e 新增 longpress 組（3 項檢查）。


## v1.8.1（2026-10-27，迭代 13）

smoke 54/54；e2e 18 組 5953 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPad mini 橫向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPad mini 直向 | webkit 27.2 | 336 ✅ | 317 ✅ |
| iPhone 14 直向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 352 ✅ | 333 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 342 ✅ | 323 ✅ |

e2e persist 組新增 1 項檢查。


## v1.8.0（2026-10-27，迭代 12）

smoke 54/54；e2e 18 組 5935 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPad mini 橫向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPad mini 直向 | webkit 27.2 | 335 ✅ | 316 ✅ |
| iPhone 14 直向 | webkit 27.2 | 351 ✅ | 332 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 351 ✅ | 332 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 341 ✅ | 322 ✅ |

e2e isoline 組 5 項檢查。


## v1.7.4（2026-10-27，迭代 11）

smoke 54/54；e2e 18 組 5863 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPad mini 橫向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPad mini 直向 | webkit 27.2 | 331 ✅ | 312 ✅ |
| iPhone 14 直向 | webkit 27.2 | 347 ✅ | 328 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 347 ✅ | 328 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 337 ✅ | 318 ✅ |

e2e taps 組新增 3 項檢查。


## v1.7.3（2026-10-27，迭代 10）

smoke 54/54；e2e 18 組 5809 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPhone 14 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 334 ✅ | 315 ✅ |

單元 perf.test.js。


## v1.7.2（2026-10-27，迭代 10）

smoke 54/54；e2e 18 組 5809 項通過、0 失敗；單元測試 30/30。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPhone 14 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 334 ✅ | 315 ✅ |

單元 perf.test.js。


## v1.7.1（2026-10-27，迭代 9）

smoke 54/54；e2e 18 組 5809 項通過、0 失敗；單元測試 26/26。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 橫向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPad mini 直向 | webkit 27.2 | 328 ✅ | 309 ✅ |
| iPhone 14 直向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 344 ✅ | 325 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 334 ✅ | 315 ✅ |

e2e `taps` 組：touch-action、連點、雙擊。


## v1.7.0（2026-10-27，迭代 8）

smoke 54/54；e2e 18 組 5735 項通過、0 失敗；單元測試 26/26。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPad mini 橫向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPad mini 直向 | webkit 27.2 | 324 ✅ | 305 ✅ |
| iPhone 14 直向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 340 ✅ | 321 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 329 ✅ | 310 ✅ |

e2e `quick` 組：按鈕 44pt、待命狀態、一次性擦除、自動還原、一次性吸色。


## v1.6.0（2026-10-27，迭代 7）

smoke 54/54；e2e 18 組 5557 項通過、0 失敗；單元測試 26/26。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPad mini 橫向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPad mini 直向 | webkit 27.2 | 314 ✅ | 295 ✅ |
| iPhone 14 直向 | webkit 27.2 | 330 ✅ | 311 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 330 ✅ | 311 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 320 ✅ | 301 ✅ |

e2e `focus` 組：進入／離開、隱藏與保留的元件、畫布面積增加與還原、小工具 44pt、專注中繪圖與復原重做、Tab 鍵（桌面）、版面檢查。ADR-007。


## v1.5.0（2026-10-27，迭代 6）

smoke 54/54；e2e 18 組 5231 項通過、0 失敗；單元測試 26/26。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPad mini 橫向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPad mini 直向 | webkit 27.2 | 296 ✅ | 277 ✅ |
| iPhone 14 直向 | webkit 27.2 | 312 ✅ | 293 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 312 ✅ | 293 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 301 ✅ | 282 ✅ |

新增單元測試 4 項（notices.pick）；e2e `notices` 組（iOS 顯示加入主畫面、44pt、說明步驟、稍後延後跨重新整理、桌面不顯示、備份提醒與下載、備份時間記錄、關於頁、選單說明、IndexedDB 連線關閉後自動儲存恢復）。ADR-006。


## v1.4.0（2026-10-27，迭代 5）

smoke 54/54；e2e 18 組 4923 項通過、0 失敗；單元測試 22/22。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPad mini 橫向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPad mini 直向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPhone 14 直向 | webkit 27.2 | 294 ✅ | 275 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 294 ✅ | 275 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 291 ✅ | 272 ✅ |

新增 e2e `diag` 組（Scribble 迴歸：畫布／取色器取消 touchmove、面板保留原生捲動、8 次快速 Apple Pencil 點擊全數上色；錯誤擷取、環狀紀錄、對話框、下載 JSON 不含作品資料、複製回饋）。ADR-004、ADR-005。第 1 輪評比：docs/reviews/review-01.md。


## v1.3.0（2026-10-27，迭代 4）

smoke 54/54；e2e 18 組 4635 項通過、0 失敗；單元測試 22/22。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPad mini 橫向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPad mini 直向 | webkit 27.2 | 262 ✅ | 243 ✅ |
| iPhone 14 直向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 278 ✅ | 259 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 275 ✅ | 256 ✅ |

註：v1.3.0 的 tag 推送時「桌面 Chromium 純靜態」一組尚在執行（發布腳本誤判完成），該組隨後 256 項全數通過，本表為補正後的完整結果；已修正發布流程（等待 JSON 結果檔而非日誌行）。

新增 `npm test` 單元測試 22 項；e2e `memory` 組（預算、修剪、保留最新 10 步、提示、面板、修剪後仍可復原）。ADR-003。


## v1.2.0（2026-10-27，迭代 3）

smoke 54/54；e2e 18 組 4473 項通過、0 失敗。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPad mini 橫向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPad mini 直向 | webkit 27.2 | 253 ✅ | 234 ✅ |
| iPhone 14 直向 | webkit 27.2 | 269 ✅ | 250 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 269 ✅ | 250 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 266 ✅ | 247 ✅ |

新增 e2e `savestate` 組（故障注入 QuotaExceededError／一般錯誤：紅點、橫幅、44pt 按鈕、備份下載內容、手動儲存回報失敗、重試、自動退避重試、儲存中再修改不遺失、重新整理後資料完整、關於頁儲存資訊）。


## v1.1.0（2026-10-27，迭代 2）

smoke 54/54；e2e 18 組 4007 項通過、0 失敗。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPad mini 橫向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPad mini 直向 | webkit 27.2 | 227 ✅ | 208 ✅ |
| iPhone 14 直向 | webkit 27.2 | 243 ✅ | 224 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 243 ✅ | 224 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 241 ✅ | 222 ✅ |

新增 e2e `a11y` 組（每設定 12–16 項）。


## v1.0.1（2026-10-26，迭代 1）

smoke 54/54；e2e 18 組 3747 項通過、0 失敗。

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPad Pro 11 直向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPad（第 7 代）橫向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPad（第 7 代）直向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPad mini 橫向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPad mini 直向 | webkit 27.2 | 213 ✅ | 194 ✅ |
| iPhone 14 直向 | webkit 27.2 | 225 ✅ | 206 ✅ |
| iPhone 14 橫向 | webkit 27.2 | 225 ✅ | 206 ✅ |
| 桌面 1920×1080 | chromium 156.0.8078.4 | 231 ✅ | 212 ✅ |

新增檢查：smoke +3（版本欄位）；e2e 每組 +2（關於版本、離線快取名）。


# 1.0.0 基準 QA（2026-10-25）

## 測試方法

- Linux 上沒有 Xcode iOS 模擬器，改用最接近的方式：**Playwright WebKit 27.2（Safari 的引擎）** 搭配 Playwright 的裝置設定（螢幕尺寸、DPR、`hasTouch`、`isMobile`、iPad／iPhone UA），以及 **Chromium 156** 1920×1080 代表 Windows 桌面。
- 每個裝置設定都跑兩個目標：**完整伺服器**（`npm start`）與 **純靜態 `dist/`**（無後端）。
- 畫布操作以頁面內合成的 `PointerEvent`（`pointerType` = `touch`／`pen`／`mouse`，含多指）驅動；按鈕、選單、對話框用 Playwright 的實際觸控 `tap()`（桌面用 `click()`）；桌面另用真實滑鼠拖曳、滾輪、右鍵與鍵盤。
- 所有匯出檔都在 Node 端解碼驗證（PNG／APNG 區塊與透明度、GIF 影格與延遲、ZIP 內容、精靈圖 JSON、.pxs）。
- 每個測試組結束都檢查：console error／warning、頁面例外、失敗的請求、HTTP ≥ 400。
- 可重複執行：`npm run e2e`（腳本 `scripts/e2e.js`）。

## 最終結果（全部通過）

| 裝置設定 | 引擎 | 伺服器 | 純靜態 dist/ |
|---|---|---|---|
| iPad Pro 11 橫向 | WebKit | 213 ✅ | 192 ✅ |
| iPad Pro 11 直向 | WebKit | 211 ✅ | 192 ✅ |
| iPad（第 7 代）橫向 | WebKit | 211 ✅ | 192 ✅ |
| iPad（第 7 代）直向 | WebKit | 211 ✅ | 192 ✅ |
| iPad mini 橫向 | WebKit | 211 ✅ | 192 ✅ |
| iPad mini 直向 | WebKit | 211 ✅ | 192 ✅ |
| iPhone 14 直向 | WebKit | 224 ✅（分兩段執行） | 204 ✅ |
| iPhone 14 橫向 | WebKit | 224 ✅（分兩段執行） | 204 ✅ |
| 桌面 1920×1080 | Chromium | 231 ✅ | 212 ✅ |

`npm run smoke`：51／51 通過。所有設定的 Service Worker 皆為 active，斷網重新整理可從快取開啟。

## 發現並修正的問題

| # | 問題 | 影響 | 修正 |
|---|---|---|---|
| 1 | `setPointerCapture` 在指標已失效時丟出例外（WebKit：「The object can not be found here.」；Chromium：NotFoundError） | 例外中斷 `pointerdown` 處理：筆畫、捏合、圖層拖曳、顏色拖曳都無法開始（極快速點按或 pointercancel 競態時會發生） | `dom.js` 新增 `capture()`（try/catch），view／panels／main 全部改用 |
| 2 | `html, body { touch-action: none }`：touch-action 會與所有祖先取交集 | 側邊欄、時間軸、iPhone 工具列、選項列、對話框、選單都**無法用手指捲動** | body 改 `manipulation`（仍禁止雙擊放大）；只有畫布、色彩方塊、把手用 `none`；捲動容器 `pan-x pan-y` + `overscroll-behavior: contain` |
| 3 | iPhone 直向頂端列超出螢幕 | **伺服器／AI 按鈕被擠出畫面外**，專案名稱只剩 16px | 手機版緊湊頂端列；≤430px 隱藏縮放百分比（選單新增「檢視 → 符合視窗／放大」） |
| 4 | 只處理上方 safe-area | iPhone 橫向時瀏海遮住工具列 | `#app`、底部面板、對話框加上左右／下方 `env(safe-area-inset-*)` |
| 5 | Safari／WebKit 原生 `<select>` 外觀 | 淺色底＋淺色字，**下拉選單文字幾乎看不見**（匯出格式、抖動、播放模式…） | 自訂 `appearance: none` 樣式與箭頭 |
| 6 | iPhone 時間軸的下拉選單被 flex 壓扁成細條，按鈕藏在橫向捲動後 | 播放模式／範圍無法操作 | 工具列子元素 `flex: none`；手機版時間軸控制列自動換行 |
| 7 | 「畫布大小」對話框的 ×2／×3／×4 直接移除 DOM，Escape 監聽器殘留 | **之後 Esc 永遠被吞掉**（無法取消選取、取消貼上） | `modal()` 關閉改為冪等、對話框被移除時自動解除監聽；按鈕改呼叫 `dlg.close()` |
| 8 | 純靜態部署每次開啟都對 `api/health` 產生 404 | console error；離線開啟時還會有網路錯誤 | 伺服器回應加 `X-Pixel-Studio` 標頭，前端先 `HEAD ./` 判斷；離線時不偵測 |
| 9 | iOS 檔案選擇器 `accept=".pxs,.gpl,.hex"` | iOS 無法對應的副檔名會**變灰無法選取** | iOS 上這類選擇器不過濾，選取後驗證內容；加上 `oncancel` |
| 10 | 精靈圖匯出 PNG 後延遲 400ms 再下載 JSON | iOS Safari 一次點擊只允許一個下載，**JSON 會被擋** | iOS 上自動打包成單一 ZIP |
| 11 | iOS 主畫面 App（standalone）沒有 blob 下載介面 | 匯出後無法存檔 | standalone 模式改用 Web Share（檔案），失敗時退回一般下載 |
| 12 | 只在畫布上取消 `gesturestart` | 在工具列上捏合會**縮放整個頁面**（iOS 忽略 `user-scalable=no`） | 在 document 上取消 `gesturestart/change/end` |
| 13 | 介面可被選取文字 | 長按色塊、影格編號時出現 iOS 放大鏡／選取框 | 介面 `user-select: none`、`-webkit-touch-callout: none`（輸入框除外） |
| 14 | 手指／筆離開後筆刷游標殘留 | 畫面上留下假的游標框 | 非滑鼠 `pointerup` 時清除 hover |
| 15 | iOS `100vh` 包含網址列 | 底部面板／對話框可能被切掉 | 加上 `dvh` 備援 |
| 16 | 底部面板把手只有 5px 高 | 很難用手指滑動收起 | 觸控範圍加大到 22px |
| 17 | 未要求持久儲存 | 瀏覽器在空間不足時可能清除 IndexedDB | 啟動時 `navigator.storage.persist()`；說明書提醒 Safari 7 天政策 |
| 18 | 冒煙測試伺服器啟動等待只有 5 秒 | 機器忙碌時偶發失敗 | 延長到 20 秒 |

對照：用原始版本跑同一套測試，iPhone 14 直向在 boot／layout／draw／history 就有 11 項失敗、iPad mini 直向有 9 項失敗（上表 1–4、8 等），修正後全部通過。

## 無法在此環境驗證的項目

- **真正的 Apple Pencil**（硬體防誤觸、懸停、延遲手感）——只能用 `pointerType: "pen"` 模擬。
- **真正的 iPadOS／iOS Safari**：實際的下載提示與「檔案」App、主畫面 App 的分享面板、真實 `accept` 行為、ITP 7 天清除、鍵盤彈出時的視窗變化、真實瀏海的 safe-area 數值（以 CSS 變數模擬 44／34px）。
- 在 Linux WebKit 中，iPad 設定的 Playwright `touchscreen.tap()` 不會產生 pointer 事件（iPhone 橫向會），因此畫布以合成 PointerEvent 測試；按鈕的觸控點按為真實事件。
- `navigator.maxTouchPoints` 在 Playwright WebKit 為 0（實機為 5），iOS 判斷依 UA。
- 真實 Windows（以 Linux 上的 Chromium 代表）、macOS Safari、Firefox 未測。
- 區網連線、Windows／macOS 防火牆、mkcert HTTPS 憑證安裝流程。
- 實機效能（大畫布、多影格）。
