# Pixel Studio 像素工作室

觸控優先、參考 Aseprite 操作習慣的像素繪圖與動畫工具。前端是可安裝的 **PWA**，在 iPad、iPhone、Windows / macOS 瀏覽器都能用，**不需要伺服器也能完整使用**（專案自動存在瀏覽器的 IndexedDB，也可存成 `.pxs` 檔）。

另外附一個**選用的 Node.js 本機伺服器**（`npm start`），在 localhost 或同一個 Wi-Fi 的區網上執行，額外提供：

- 伺服器專案儲存與多裝置即時同步（WebSocket）
- 給 AI 用的 **REST API** 與 **MCP 端點**，API 金鑰可設定權限範圍與可存取的專案
- **伺服器端強制「API 金鑰不能刪除任何東西」**
- 活動紀錄 + 一鍵還原 AI 動作；AI 的繪製會即時出現在畫布上，並進入歷史紀錄（可用 Ctrl+Z 復原）

> 這是原型版本，尚未決定正式託管方式。附有通用 `Dockerfile`（選用）。

---

## 功能

### 繪圖工具
| 工具 | 快捷鍵 | 說明 |
|---|---|---|
| 鉛筆 | `B` | 1px 或 1–32px 筆刷（方 / 圓）、**像素完美**模式（去除 L 形轉角）、**抖動圖樣筆刷**（棋盤、25%、12%、75%、橫線、直線） |
| 橡皮擦 | `E` | 同鉛筆的筆刷選項 |
| 油漆桶 | `G` | 相連區域 / 全部同色；有選取範圍時只填選取內 |
| 滴管 | `I` | 取樣合成畫面或目前圖層；繪圖時按住 `Alt` 暫時切換 |
| 直線 / 矩形 / 橢圓 | `L` / `U` / `Shift+U` | 外框或填滿，`Shift` 鎖定 45° 或正方 / 正圓 |
| 矩形選取 / 套索 | `M` / `Q` | `Shift` 加選、`Alt` 減選；拖曳選取內容即可移動；複製 / 剪下 / 貼上、水平 / 垂直翻轉、旋轉 90°、裁切畫布 |
| 移動 | `V` | 移動整個圖層內容（目前影格），有選取時移動選取內容；方向鍵微調 1px |
| 平移 | `H` | 也可用空白鍵拖曳、滑鼠中鍵、雙指拖曳 |
| 對稱 | — | 左右對稱 / 上下對稱（可同時開啟） |

### 顏色與調色盤
- 主要 / 次要顏色（右鍵用次要色繪製，`X` 交換），**支援透明度**
- HSV 色彩選擇器 + 透明度滑桿 + 十六進位色碼（`#RRGGBB` / `#RRGGBBAA`）
- 內建 DawnBringer 32（預設）、PICO-8、Endesga 32、Game Boy
- 新增 / 移除 / 取代顏色（長按或右鍵色塊）、從畫面擷取所有顏色
- 匯入 / 匯出 `.hex`、`.gpl`（GIMP / Aseprite 相容）

### 圖層
新增、複製、刪除、雙擊重新命名、**拖曳 ⋮⋮ 調整順序**、顯示 / 隱藏、鎖定（鎖定後 AI 也無法寫入）、不透明度、混合模式（一般、色彩增值 multiply、濾色 screen、覆蓋 overlay）、向下合併。

### 動畫時間軸（cel 架構，類似 Aseprite）
- 影格 × 圖層的格狀時間軸；新增 / 複製 / 刪除 / 移動影格
- 每格獨立時長（ms，雙擊或長按影格編號修改；Shift+點選可批次修改），或用 FPS 一次套用全部
- 播放：循環 / 來回（ping-pong）/ 單次；可指定只播放某個標籤
- **標籤**：命名的影格範圍（如 idle、walk），方向可設正向 / 反向 / 來回
- **洋蔥皮**（`F3`）：前後各幾格、不透明度、色調（預設過去紅、未來藍，可自訂顏色）

### 畫布與檢視
- 新專案預設 16 / 32 / 64 / 128 / 256 / 320×180 或自訂寬高（上限 2048）
- 之後可調整畫布大小（9 宮格錨點）、裁切到選取範圍、最近鄰縮放 ×0.5 / ×2 / ×3 / ×4
- 縮放：觸控捏合、滑鼠滾輪、觸控板捏合；像素格線（`Ctrl+'`）、自訂格線（例如 8×8 tile）
- **參考圖**：匯入設計稿當半透明描圖層（不會被匯出），可調整透明度、位置、縮放、顯示在上 / 下方；連上伺服器時 AI 可讀取
- **防誤觸**：偵測到 Apple Pencil / 觸控筆時自動開啟「僅筆繪圖」，手指只能平移縮放；可手動切換
- 觸控手勢：雙指點按 = 復原、三指點按 = 重做

### 復原 / 重做
完整歷史堆疊（最多 120 步），歷史紀錄面板可點選跳回任一步。AI 透過 API 做的修改也會以「🤖 金鑰名稱：動作」的形式出現在歷史中，擁有者可直接復原。

### 匯入 / 匯出
- PNG（目前影格，保留透明背景），放大 ×1–×20（最近鄰，不模糊）
- 所有影格 PNG 打包 ZIP
- 精靈圖 PNG + JSON（Aseprite 相容格式：`frames`、`duration`、`meta.frameTags`、`meta.layers`），橫排 / 直排 / 格狀
- GIF 動畫（含透明、循環 / 來回 / 單次）
- APNG 動畫（完整 8-bit 透明度）
- 匯入 PNG / JPG / WebP / GIF（GIF 會拆成影格）：可開成新專案、新圖層或參考圖；也可直接拖放檔案到視窗，或在桌面版 `Ctrl+V` 貼上剪貼簿圖片
- 原生專案檔 `.pxs`（JSON）下載 / 開啟

### PWA / 離線
- `manifest` + Service Worker：可「加入主畫面」，以全螢幕 App 方式開啟
- **注意**：瀏覽器只允許在 `https://` 或 `localhost` 上啟用 Service Worker（離線快取）。用區網 `http://192.168.x.x` 開啟時 App 一樣能用、資料一樣存在 IndexedDB，只是沒有離線快取。需要的話見下方「HTTPS（選用）」。

---

## 快速開始

需要 **Node.js 20 以上**。

```bash
cd pixel-studio
npm install
npm run build
npm start
```

終端機會顯示：

```
🎨 Pixel Studio 伺服器已啟動
   本機:   http://localhost:8787
   區網:   http://192.168.1.20:8787   ← iPad / iPhone 連同一個 Wi-Fi 開這個
   API 文件: http://localhost:8787/docs   MCP: http://localhost:8787/mcp
   擁有者密碼（自動產生，存於 .../data/owner-password.txt）: xxxxxxxx
```

建議自己設定擁有者密碼：

```bash
# macOS / Linux
OWNER_PASSWORD=你的密碼 npm start

# Windows PowerShell
$env:OWNER_PASSWORD="你的密碼"; npm start

# Windows cmd
set OWNER_PASSWORD=你的密碼 && npm start
```

### 只用前端（不開伺服器）
`npm run build` 後的 `dist/` 資料夾是純靜態網站，可以用任何靜態伺服器開啟（例如 `npx serve dist`、`python -m http.server -d dist`），或之後放到任何靜態託管。沒有伺服器時，右上角圓點為灰色，App 以單機模式運作，所有功能（除了雲端同步與 AI API）都可使用。

### 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `OWNER_PASSWORD` | 自動產生並存在 `DATA_DIR/owner-password.txt` | 擁有者登入密碼 |
| `DATA_DIR` | `./data` | 專案 JSON、API 金鑰（只存 SHA-256 雜湊）、活動紀錄、還原資料 |
| `PORT` | `8787` | 連接埠 |
| `HOST` | `0.0.0.0` | 監聽位址；只想本機使用可設 `127.0.0.1` |
| `TLS_CERT` / `TLS_KEY` | — | 設定後改用 HTTPS（PEM 檔路徑） |

---

## 在 iPad / iPhone 上使用（同一個 Wi-Fi）

1. 電腦執行 `npm start`，記下終端機顯示的「區網」網址，例如 `http://192.168.1.20:8787`。
2. iPad 連到**同一個 Wi-Fi**，用 Safari 開啟該網址。
3. 點 Safari 的「分享」→「加入主畫面」，之後就能像 App 一樣全螢幕開啟。
4. 要使用伺服器同步 / AI：點右上角圓點 → 輸入擁有者密碼登入 →「同步」分頁 →「上傳並同步目前專案」。

連不上時：
- **Windows**：第一次執行 Node 時防火牆會詢問，請允許「私人網路」；或在「Windows Defender 防火牆 → 允許應用程式」中勾選 Node.js。
- **macOS**：系統設定 → 網路 → 防火牆，允許 node 接受連入連線。
- 確認電腦與 iPad 在同一個網段（有些公共 / 訪客 Wi-Fi 會隔離裝置）。

### HTTPS（選用，讓 iPad 也能離線快取）
用 [mkcert](https://github.com/FiloSottile/mkcert) 產生本機憑證：

```bash
mkcert -install
mkcert 192.168.1.20 localhost        # 產生 192.168.1.20+1.pem 與 192.168.1.20+1-key.pem
TLS_CERT=./192.168.1.20+1.pem TLS_KEY=./192.168.1.20+1-key.pem OWNER_PASSWORD=你的密碼 npm start
```

再把 mkcert 的根憑證（`mkcert -CAROOT` 資料夾中的 `rootCA.pem`）傳到 iPad 安裝，並在「設定 → 一般 → 關於本機 → 憑證信任設定」中啟用完全信任，之後用 `https://192.168.1.20:8787` 開啟即可。

---

## 讓 AI 幫你畫：API 金鑰、REST 與 MCP

### 1. 建立 API 金鑰
1. 開啟 App → 右上角圓點 → 用擁有者密碼登入。
2. 「同步」分頁：把要讓 AI 畫的專案上傳到伺服器（AI 只能存取伺服器上的專案）。
3. 「API 金鑰」分頁：輸入名稱（例如 Claude）、勾選權限範圍、選擇「全部專案」或指定專案、設定速率限制 → 建立。
4. **金鑰只會顯示一次**，請立即複製。金鑰可隨時撤銷。

| 權限範圍 | 允許的動作 |
|---|---|
| `project:read` | 列出專案、取得專案概覽 |
| `canvas:read` | 取得影格 / 圖層 PNG、精靈圖、像素陣列 |
| `canvas:write` | 畫像素、線、矩形、橢圓、填色、貼上 PNG |
| `layer:create` | 新增圖層 |
| `frame:create` | 新增影格、設定影格時長、新增標籤 |
| `palette:write` | 修改調色盤 |
| `reference:read` | 讀取擁有者上傳的參考 / 設計圖 |

**安全規則（伺服器端強制，不只是文件說明）：**
- API 金鑰**沒有任何刪除能力**：所有 `/api/v1` 的 `DELETE` 一律 403；沒有刪除專案、圖層、影格、cel 的工具；任何會把非空 cel 清成全空的寫入會被拒絕（403 `forbidden_clear`）；MCP 呼叫名稱含 delete / remove / clear 的工具一律拒絕。
- 擁有者鎖定的圖層，AI 寫入會得到 423。
- 每把金鑰各自有速率限制（每分鐘請求數），超過回 429。
- 每個 API 動作都記錄在「活動紀錄」（金鑰名稱、動作、時間、內容），寫入類動作可一鍵還原。

### 2. REST 範例（curl）

```bash
KEY=pxs_你的金鑰
BASE=http://localhost:8787
PID=你的專案ID      # 在「同步」分頁或 list_projects 可以看到

# 列出專案 / 概覽
curl -H "Authorization: Bearer $KEY" $BASE/api/v1/projects
curl -H "Authorization: Bearer $KEY" $BASE/api/v1/projects/$PID

# 取得第 0 格的 PNG（放大 8 倍）
curl -H "Authorization: Bearer $KEY" "$BASE/api/v1/projects/$PID/image?frame=0&scale=8" -o frame0.png

# 畫像素（批次）
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"layer":0,"frame":0,"pixels":[[1,1,"#ff004d"],[2,1,"#ff004d"],{"x":3,"y":1,"color":"#29adff80"}]}' \
  $BASE/api/v1/projects/$PID/draw/pixels

# 畫填滿的橢圓
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"shape":"ellipse","x0":4,"y0":4,"x1":20,"y1":16,"color":"#ffec27","filled":true}' \
  $BASE/api/v1/projects/$PID/draw/shape

# 複製第 0 格成新影格（做動畫）
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"copyFrom":0,"duration":120}' $BASE/api/v1/projects/$PID/frames

# 刪除會被拒絕
curl -X DELETE -H "Authorization: Bearer $KEY" $BASE/api/v1/projects/$PID    # → 403
```

完整說明：`http://localhost:8787/docs`；OpenAPI 3 規格：`http://localhost:8787/api/openapi.json`。

REST 端點一覽（GET 參數放 query string，POST 參數放 JSON body；`layer` 可用索引（0 = 最底層）、ID 或名稱，`frame` 用索引或 ID）：

| 工具 | 方法與路徑 | 權限 |
|---|---|---|
| list_projects | `GET /api/v1/projects` | project:read |
| get_project_overview | `GET /api/v1/projects/{id}` | project:read |
| get_frame_image | `GET /api/v1/projects/{id}/image?frame=&layer=&scale=` | canvas:read |
| get_sprite_sheet | `GET /api/v1/projects/{id}/sheet` | canvas:read |
| get_cel_pixels | `GET /api/v1/projects/{id}/pixels?layer=&frame=` | canvas:read |
| get_reference_images | `GET /api/v1/projects/{id}/references` | reference:read |
| draw_pixels | `POST /api/v1/projects/{id}/draw/pixels` | canvas:write |
| draw_shape | `POST /api/v1/projects/{id}/draw/shape` | canvas:write |
| fill | `POST /api/v1/projects/{id}/draw/fill` | canvas:write |
| paste_image | `POST /api/v1/projects/{id}/draw/paste` | canvas:write |
| add_layer | `POST /api/v1/projects/{id}/layers` | layer:create |
| add_frame | `POST /api/v1/projects/{id}/frames` | frame:create |
| set_frame_duration | `POST /api/v1/projects/{id}/frames/duration` | frame:create |
| add_tag | `POST /api/v1/projects/{id}/tags` | frame:create |
| set_palette | `POST /api/v1/projects/{id}/palette` | palette:write |

### 3. MCP 設定（Claude Desktop / Claude Code / Cursor 等）
MCP 端點：`POST http://localhost:8787/mcp`（Streamable HTTP，無狀態 JSON 回應），用同一把金鑰以 Bearer 驗證。提供與 REST 相同的 15 個工具；`get_frame_image`、`get_sprite_sheet`、`get_reference_images` 會回傳 PNG 圖片內容，讓有視覺能力的模型直接「看到」畫面與設計稿。

一般 MCP 用戶端設定（JSON）：

```json
{
  "mcpServers": {
    "pixel-studio": {
      "type": "http",
      "url": "http://localhost:8787/mcp",
      "headers": { "Authorization": "Bearer pxs_你的金鑰" }
    }
  }
}
```

Claude Code：

```bash
claude mcp add --transport http pixel-studio http://localhost:8787/mcp --header "Authorization: Bearer pxs_你的金鑰"
```

只支援 stdio 的用戶端可以透過 `mcp-remote` 轉接：

```json
{
  "mcpServers": {
    "pixel-studio": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/mcp", "--header", "Authorization: Bearer pxs_你的金鑰"]
    }
  }
}
```

> 雲端服務（例如 ChatGPT 網頁版的連接器）無法連到你電腦的 localhost / 區網位址；要讓它們使用，需要一個公開的 HTTPS 網址（例如 Cloudflare Tunnel：`cloudflared tunnel --url http://localhost:8787`）。請務必設定強密碼，並只給 AI 需要的權限範圍。

建議給 AI 的工作流程：`list_projects` → `get_project_overview` → `get_reference_images`（看設計稿）→ `get_frame_image`（看目前畫面）→ `add_frame { copyFrom }` + `draw_*` 逐格修改 → `set_frame_duration` / `add_tag`。

### 4. 即時同步與還原
- 擁有者在 App 中開啟已同步的專案時，AI 的每一筆修改都會即時出現在畫布上，並以 Toast 與歷史紀錄「🤖 Claude：…」顯示。
- 在 App 中按復原（Ctrl+Z / 雙指點按）即可撤銷 AI 的修改，結果會同步回伺服器。
- 也可以在「活動紀錄」分頁對單筆 AI 動作按「還原」（之後對相同 cel 的修改可能一併被還原）。
- App 關閉期間 AI 做的修改，下次開啟時會自動載入伺服器上較新的版本；若本機也有離線修改，會先另存一份「本機衝突副本」。

---

## 測試

完整的使用說明書（繁體中文、含截圖）：[`docs/使用說明書.md`](docs/使用說明書.md)。

```bash
npm run smoke
```

會在暫存資料夾啟動伺服器，測試：擁有者登入、建立金鑰、專案存取限制、所有繪圖工具、DELETE → 403、清空 cel → 403、鎖定圖層 → 423、匯出 PNG 的透明度、MCP initialize / tools/list / tools/call（含圖片）、活動紀錄還原、速率限制、撤銷金鑰、OpenAPI 與文件頁。

### 瀏覽器端對端測試（iPad / iPhone / 桌面）

```bash
npx playwright install --with-deps webkit chromium   # 第一次
npm run e2e                                          # build + 全部裝置 × （伺服器 + 純靜態 dist/）
npm run e2e -- --profile=ipad-pro-11-landscape --target=static --suite=draw,select
npm run e2e -- --list                                # 列出裝置設定與測試組
npm run e2e -- --shots                               # 同時更新 docs/screenshots/
```

`scripts/e2e.js` 用 Playwright **WebKit（Safari 的引擎）** 模擬 iPad Pro 11、iPad（第 7 代）、iPad mini（橫 / 直）、iPhone 14（直 / 橫），以及 Chromium 1920×1080 桌面，透過觸控 / 筆 / 滑鼠 pointer 事件實際操作 UI：所有工具、選取、調色盤匯入匯出、圖層、時間軸 / 標籤 / 播放、洋蔥皮、縮放捏合、雙指 / 三指復原重做、歷史面板、參考圖、畫布大小、所有匯出格式（解碼驗證 PNG / GIF / APNG / ZIP / 精靈圖 JSON / .pxs）、匯入、IndexedDB 自動儲存、PWA manifest / Service Worker / 離線、雲端登入 / 同步、API 金鑰 UI、AI REST 與 MCP 繪圖即時出現在畫布、活動紀錄還原、禁止刪除；並檢查版面（按鈕是否超出畫面、底部面板、safe-area、touch-action、頁面不捲動不縮放）與所有 console / 頁面 / 網路錯誤。結果寫在 `test-results/e2e/*.json`。

使用說明書 PDF：`node scripts/manual-pdf.js [輸出.pdf]`（需要 pandoc 與 Noto Sans CJK 字型）。

## 專案結構

```
pixel-studio/
├─ public/                 前端原始碼（純 ES modules，無框架、無打包工具）
│  ├─ index.html, css/app.css, manifest.webmanifest, sw.js
│  └─ js/
│     ├─ core/raster.js    前後端共用的像素演算法（線、橢圓、填色、合成、混合模式…）
│     ├─ core/palettes.js  內建調色盤、.hex/.gpl 解析
│     ├─ state.js          文件模型、復原 / 重做
│     ├─ tools.js          繪圖工具、選取、浮動選取
│     ├─ view.js           畫布繪製、洋蔥皮、參考圖、觸控 / 筆 / 滑鼠輸入
│     ├─ panels.js         工具列、調色盤、時間軸、圖層…
│     ├─ dialogs.js        新專案、匯出、伺服器 / API 金鑰 / 活動紀錄
│     ├─ formats.js        GIF 編碼 / 解碼、PNG / APNG 編碼、ZIP
│     ├─ io.js, storage.js, cloud.js, main.js
├─ server/                 選用的本機伺服器（Express + ws + pngjs）
│  ├─ index.js             路由、靜態檔、WebSocket
│  ├─ ops.js               AI 工具定義（REST / MCP / OpenAPI 共用，唯一真實來源）
│  ├─ mcp.js, openapi.js, store.js, png.js
├─ scripts/build.js        public → dist、產生圖示、Service Worker 版本
├─ scripts/smoke.js        伺服器冒煙測試（51 項）
├─ scripts/e2e.js          瀏覽器端對端測試（WebKit iPad / iPhone + Chromium 桌面）
├─ scripts/manual-pdf.js   使用說明書 → PDF
├─ docs/                   使用說明書.md、QA測試報告.md、screenshots/
└─ Dockerfile              選用
```

`npm run build` 只是把 `public/` 複製到 `dist/` 並產生 Service Worker 快取清單，沒有轉譯，所以開發時直接改 `public/` 再重新整理即可（伺服器在沒有 `dist/` 時會直接提供 `public/`）。

## Docker（選用）

```bash
docker build -t pixel-studio .
docker run -p 8787:8787 -e OWNER_PASSWORD=你的密碼 -v pixel-data:/data pixel-studio
```

## 已知限制
- 動畫 WebP 匯出尚未實作（請用 APNG 或 GIF）。
- GIF 只有 1-bit 透明（alpha < 50% 視為透明）；需要半透明請用 PNG / APNG。
- 同時在多個裝置編輯同一個 cel 時採「最後寫入者勝」；不同 cel 不會互相覆蓋。
- 沒有 Apple Pencil 壓力感應（依需求刻意不做）；也沒有連結 cel（linked cels）、切片（slices）、tilemap。
- 單一擁有者帳號，沒有多使用者權限。
- iPhone / iPad 的 Safari 可能清除超過 7 天未開啟網站的資料：建議「加入主畫面」、定期下載 .pxs 或使用伺服器同步。
- iOS 上精靈圖的 PNG + JSON 會自動打包成一個 ZIP（Safari 一次點擊只允許一個下載）；從主畫面 App 匯出時改用分享面板。
- 觸控裝置無法雙擊重新命名圖層，請用 ⚙ 圖層屬性。
