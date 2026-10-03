const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackup, validateBackup } = require('../shared/backup.js');
const { documentToPlainText } = require('../shared/richtext.js');

test('creates a complete version 3 backup with exact persistent-store keys', () => {
  const backup = createBackup(
    { globalVisible: false, theme: 'dark', accent: 'teal' },
    { 'youtube.com': { document: { version: 1, blocks: [{ type: 'ul', items: [[{
      text: 'שלום https://example.com', bold: true, italic: true, underline: true, strike: true,
      color: '#112233', font: 'serif', size: 24
    }]] }] }, updatedAt: '2026-10-03T00:00:00.000Z' } },
    { 'youtube.com': { visibility: 'show', direction: 'rtl', buttonPosition: { x: 10, y: 20 }, panelPosition: { x: 30, y: 40 }, panelSize: { width: 600, height: 400 } } }
  );
  assert.deepEqual(Object.keys(backup).sort(), ['dn_notes', 'dn_settings', 'dn_sites', 'schemaVersion']);
  assert.equal(backup.schemaVersion, 3);
  const restored = validateBackup(backup);
  assert.deepEqual(restored.settings, { globalVisible: false, theme: 'dark', accent: 'teal' });
  assert.equal(documentToPlainText(restored.notes['youtube.com'].document), 'שלום https://example.com');
  assert.deepEqual(restored.notes['youtube.com'].document.blocks[0].items[0][0], {
    text: 'שלום https://example.com', bold: true, italic: true, underline: true, strike: true,
    color: '#112233', font: 'serif', size: 24
  });
  assert.deepEqual(restored.sites['youtube.com'], {
    visibility: 'show', direction: 'rtl', buttonPosition: { x: 10, y: 20 }, panelPosition: { x: 30, y: 40 }, panelSize: { width: 600, height: 400 }
  });
});

test('imports version 2 backups with settings notes and sites', () => {
  const restored = validateBackup({ version: 2, settings: { globalVisible: false, theme: 'dark', accent: 'rose' }, notes: {
    'youtube.com': { document: { version: 1, blocks: [{ type: 'p', runs: [{ text: 'v2', bold: true }] }] }, updatedAt: null }
  }, sites: { 'youtube.com': { visibility: 'show', direction: 'rtl', panelSize: { width: 500, height: 300 } } } });
  assert.equal(documentToPlainText(restored.notes['youtube.com'].document), 'v2');
  assert.equal(restored.notes['youtube.com'].document.blocks[0].runs[0].font, null);
  assert.equal(restored.notes['youtube.com'].document.blocks[0].runs[0].size, null);
  assert.equal(restored.settings.accent, 'rose');
  assert.equal(restored.sites['youtube.com'].visibility, 'show');
});

test('imports version 1 backups without losing note text visibility direction or position', () => {
  const restored = validateBackup({ version: 1, settings: { globalVisible: true }, notes: {
    'https://m.youtube.com/watch?v=1': {
      text: 'legacy note', direction: 'rtl', hidden: true, position: { x: 44, y: 55 }, updatedAt: '2026-10-03T00:00:00.000Z'
    }
  }});
  assert.equal(documentToPlainText(restored.notes['youtube.com'].document), 'legacy note');
  assert.equal(restored.sites['youtube.com'].visibility, 'hide');
  assert.equal(restored.sites['youtube.com'].direction, 'rtl');
  assert.deepEqual(restored.sites['youtube.com'].buttonPosition, { x: 44, y: 55 });
});

test('sanitizes hostile formatting fields in a version 3 backup', () => {
  const restored = validateBackup({ schemaVersion: 3, dn_settings: { theme: 'system', accent: 'url(javascript:1)' }, dn_notes: {
    'example.com': { document: { version: 1, blocks: [{ type: 'p', runs: [{
      text: '<script>alert(1)</script>', color: 'javascript:1', font: 'url(javascript:1)', size: 999, onclick: 'x'
    }] }] } }
  }, dn_sites: { 'example.com': { direction: 'wat', visibility: 'wat', panelSize: { width: 99999, height: -1 } } } });
  const run = restored.notes['example.com'].document.blocks[0].runs[0];
  assert.equal(run.text, '<script>alert(1)</script>');
  assert.equal(run.color, null);
  assert.equal(run.font, null);
  assert.equal(run.size, null);
  assert.equal(Object.prototype.hasOwnProperty.call(run, 'onclick'), false);
  assert.deepEqual(restored.settings, { globalVisible: false, theme: 'light', accent: 'violet' });
});

test('rejects malformed backup without returning partial data', () => {
  assert.throws(() => validateBackup({ schemaVersion: 3, dn_notes: [], dn_sites: {}, dn_settings: {} }), /Invalid backup/);
  assert.throws(() => validateBackup({ schemaVersion: 99, dn_notes: {}, dn_sites: {}, dn_settings: {} }), /Unsupported backup version/);
  assert.throws(() => validateBackup({ schemaVersion: 3, dn_notes: {}, dn_sites: {} }), /missing dn_settings/);
});

test('rejects prototype-pollution domain keys in notes and sites', () => {
  const notes = Object.create(null);
  Object.defineProperty(notes, '__proto__', { value: { document: {} }, enumerable: true });
  assert.throws(() => validateBackup({ schemaVersion: 3, dn_settings: {}, dn_notes: notes, dn_sites: {} }), /unsafe domain key/);

  const sites = Object.create(null);
  Object.defineProperty(sites, 'constructor', { value: {}, enumerable: true });
  assert.throws(() => validateBackup({ schemaVersion: 3, dn_settings: {}, dn_notes: {}, dn_sites: sites }), /unsafe domain key/);
});
