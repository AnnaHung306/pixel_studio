# ADR-006：資料安全提示（加入主畫面、備份提醒）與 IndexedDB 自動重連
- 狀態：採納（1.5.0）
- 背景（review-01 盲點 #3、#4、#9）：Safari 分頁中，ITP 會在「7 天 Safari 使用期間未造訪」後刪除網站所有 script 可寫入儲存（含 IndexedDB）；主畫面 App 有獨立計數且 `storage.persist()` 較易獲准；iPadOS 26 起主畫面 App 與 Safari 分頁的儲存互相隔離。另外 Safari 26.x 之前偶有 IndexedDB 連線永久失效、需重新載入才能再寫入。
- 決定：
  1. `notices.js` 在頂端列下方顯示一條提示列（一次一則）：iOS／iPadOS 的 Safari 分頁顯示「加入主畫面」（含 iPadOS 26 步驟與「資料分開」說明）；有作品且 7 天沒有 .pxs 備份（新使用者先給 7 天）顯示「下載備份」。每則可「稍後」延後 7 天（記在 IndexedDB settings）。選擇邏輯 `pick()` 為純函式並有單元測試。
  2. 每次下載 .pxs 記錄 `lastBackupAt`；「關於」顯示最後備份時間與執行方式（主畫面 App／瀏覽器分頁）。「☰」新增「加入主畫面」說明。
  3. 自動化瀏覽器（`navigator.webdriver`）預設不顯示提示，避免影響其他 e2e 組；`notices` 組以 `window.__forceNotices` 強制測試。
  4. `storage.js`：連線 `onclose`／`onversionchange` 時丟棄快取的連線；交易建立時遇到 InvalidStateError（連線已關閉）自動重開並重試一次。
- 後果：Safari 分頁使用者每 7 天最多看到一次提示；無法偵測使用者實際是否已在另一個主畫面 App 中有資料（隔離），以說明文字補足。
