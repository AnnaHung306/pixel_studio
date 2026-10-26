import test from 'node:test';
import assert from 'node:assert/strict';
import { pick, SNOOZE } from '../../public/js/notices.js';

const now = Date.UTC(2026, 9, 27);
const D = 86400000;
test('iOS Safari tab → install notice; Home Screen app → none', () => {
  assert.equal(pick({ ios: true, standalone: false, now, lastBackup: now }), 'install');
  assert.equal(pick({ ios: true, standalone: true, now, lastBackup: now }), null);
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: now }), null);
});
test('install notice snoozes for 7 days', () => {
  assert.equal(pick({ ios: true, standalone: false, now, installSnooze: now - 2 * D, lastBackup: now }), null);
  assert.equal(pick({ ios: true, standalone: false, now, installSnooze: now - SNOOZE - 1, lastBackup: now }), 'install');
});
test('backup reminder after 7 days without backup, counting from first use', () => {
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: now - 8 * D, firstUse: now - 30 * D }), 'backup');
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: 0, firstUse: now - 3 * D }), null, 'new user gets a grace week');
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: 0, firstUse: now - 9 * D }), 'backup');
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: now - 8 * D, backupSnooze: now - D }), null, 'snoozed');
  assert.equal(pick({ ios: false, standalone: false, now, lastBackup: now - 8 * D, hasWork: false }), null, 'nothing to back up');
});
test('install notice takes precedence over backup reminder', () => {
  assert.equal(pick({ ios: true, standalone: false, now, lastBackup: now - 9 * D, firstUse: now - 9 * D }), 'install');
});
