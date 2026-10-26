// Data-safety notices (1.5.0, review-01 blind spots #3/#4):
//  • Safari tab on iOS/iPadOS: script-writable storage (IndexedDB) can be wiped after 7 days of Safari use
//    without visiting the site, and the Home Screen app keeps a separate copy → suggest "Add to Home Screen".
//  • Backup reminder: no .pxs backup for 7 days while there is work on this device.
// Shown in one bar under the top bar; each can be postponed ("稍後", 7 days) and remembers that in settings.
import { h, isIOS, modal } from './dom.js';
import * as store from './storage.js';

const DAY = 86400000;
export const SNOOZE = 7 * DAY;
export const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
// Automated browsers (navigator.webdriver) don't get notices unless a test forces them, so other UI tests are unaffected.
const suppressed = () => navigator.webdriver && !window.__forceNotices;

let bar = null, hooks = { backup: () => {} };
export function init(h0) { hooks = { ...hooks, ...h0 }; }

export async function backupInfo() { return (await store.getSetting('lastBackupAt', 0)) || 0; }
export async function markBackup() { await store.setSetting('lastBackupAt', Date.now()); await check(); }

// Decide which notice (if any) applies right now. Pure enough to unit-test via the `env` override.
export function pick({ ios, standalone, now, installSnooze = 0, backupSnooze = 0, lastBackup = 0, firstUse = now, hasWork = true }) {
  if (ios && !standalone && now - installSnooze > SNOOZE) return 'install';
  const since = Math.max(lastBackup, firstUse);
  if (hasWork && now - since > SNOOZE && now - backupSnooze > SNOOZE) return 'backup';
  return null;
}

export async function check() {
  if (!bar) bar = document.getElementById('notice-bar');
  if (!bar) return null;
  if (suppressed()) { bar.classList.add('hidden'); return null; }
  const now = Date.now();
  let firstUse = await store.getSetting('firstUseAt', 0);
  if (!firstUse) { firstUse = now; await store.setSetting('firstUseAt', now); }
  const projects = await store.listProjects().catch(() => []);
  const kind = pick({
    ios: isIOS, standalone: isStandalone(), now, firstUse,
    installSnooze: await store.getSetting('installNoticeSnooze', 0), backupSnooze: await store.getSetting('backupNoticeSnooze', 0),
    lastBackup: await backupInfo(), hasWork: projects.some((p) => p.updatedAt > 0),
  });
  render(kind);
  return kind;
}

function render(kind) {
  bar.innerHTML = '';
  bar.dataset.kind = kind || '';
  if (!kind) { bar.classList.add('hidden'); return; }
  const later = h('button', { class: 'btn', 'data-act': 'later', onclick: async () => { await store.setSetting(kind === 'install' ? 'installNoticeSnooze' : 'backupNoticeSnooze', Date.now()); check(); } }, '稍後');
  if (kind === 'install') {
    bar.append(h('span', { class: 'msg' }, '建議「加入主畫面」：在 Safari 分頁中，若 7 天沒開啟本 App，瀏覽器可能清除作品。主畫面 App 較不會被清除，可離線使用。'),
      h('span', { class: 'acts' }, h('button', { class: 'btn primary', 'data-act': 'how', onclick: installHelp }, '如何加入'), later));
  } else {
    bar.append(h('span', { class: 'msg' }, '已超過 7 天沒有備份作品。建議下載 .pxs 備份存到「檔案」或雲端硬碟。'),
      h('span', { class: 'acts' }, h('button', { class: 'btn primary', 'data-act': 'backup', onclick: () => hooks.backup() }, '下載備份'), later));
  }
  bar.classList.remove('hidden');
}

export function installHelp() {
  return modal({
    title: '加入主畫面',
    body: h('div', { class: 'install-help' },
      h('ol', {},
        h('li', {}, '在 Safari 點分享按鈕（方框加向上箭頭；iPad 在右上角）。'),
        h('li', {}, '選「加入主畫面」，確認「以 Web App 開啟」為開啟，按「加入」。'),
        h('li', {}, '之後從主畫面圖示開啟 Pixel Studio。')),
      h('p', { class: 'small' }, '注意：主畫面 App 與 Safari 分頁的資料是分開的。要搬移目前的作品，請先在這裡「☰ → 下載專案檔 .pxs」，再到主畫面 App「☰ → 開啟 / 匯入檔案」。')),
    buttons: [{ label: '知道了', class: 'primary', value: true }],
  });
}
