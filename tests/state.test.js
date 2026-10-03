const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clampPosition,
  sanitizeDirection,
  makeDefaultSettings,
  sanitizeSettings,
  makeDefaultSite,
  sanitizeSiteRecord,
  resolveVisibility,
  resetLayout,
  sanitizePanelSize,
  upsertNoteDocument
} = require('../shared/state.js');

test('clamps saved position into the visible viewport', () => {
  assert.deepEqual(clampPosition({ x: 900, y: -20 }, 320, 220, 1000, 800), { x: 672, y: 8 });
});

test('accepts only supported writing directions', () => {
  assert.equal(sanitizeDirection('rtl'), 'rtl');
  assert.equal(sanitizeDirection('ltr'), 'ltr');
  assert.equal(sanitizeDirection('weird'), 'auto');
});

test('global settings use only light or dark themes and safe accent presets', () => {
  assert.deepEqual(makeDefaultSettings(), { globalVisible: false, theme: 'light', accent: 'violet' });
  assert.deepEqual(sanitizeSettings({ globalVisible: false, theme: 'dark', accent: 'teal' }), {
    globalVisible: false,
    theme: 'dark',
    accent: 'teal'
  });
  assert.deepEqual(sanitizeSettings({ globalVisible: 'no', theme: 'system', accent: 'javascript:bad' }), {
    globalVisible: false,
    theme: 'light',
    accent: 'violet'
  });
});

test('site visibility can override the global default in either direction', () => {
  assert.equal(resolveVisibility(true, 'default'), true);
  assert.equal(resolveVisibility(false, 'default'), false);
  assert.equal(resolveVisibility(false, 'show'), true);
  assert.equal(resolveVisibility(true, 'hide'), false);
});

test('reset layout preserves visibility and direction while clearing only geometry', () => {
  const site = sanitizeSiteRecord({
    visibility: 'show',
    direction: 'rtl',
    buttonPosition: { x: 10, y: 20 },
    panelPosition: { x: 30, y: 40 },
    panelSize: { width: 720, height: 510 }
  });
  assert.deepEqual(resetLayout(site), {
    visibility: 'show',
    direction: 'rtl',
    buttonPosition: null,
    panelPosition: null,
    panelSize: null
  });
});

test('site records sanitize geometry and visibility without creating note content', () => {
  assert.deepEqual(makeDefaultSite(), {
    visibility: 'default', direction: 'auto', buttonPosition: null, panelPosition: null, panelSize: null
  });
  assert.deepEqual(sanitizeSiteRecord({ visibility: 'maybe', direction: 'rtl', panelSize: { width: -1, height: 99999 } }), {
    visibility: 'default', direction: 'rtl', buttonPosition: null, panelPosition: null, panelSize: { width: 280, height: 1200 }
  });
});

test('panel size is clamped to safe usable bounds', () => {
  assert.deepEqual(sanitizePanelSize({ width: 100, height: 50 }), { width: 280, height: 220 });
  assert.deepEqual(sanitizePanelSize({ width: 2000, height: 5000 }), { width: 1200, height: 1200 });
  assert.equal(sanitizePanelSize(null), null);
});

test('empty documents delete note records instead of bloating the note manager', () => {
  const notes = { 'youtube.com': { document: { version: 1, blocks: [{ type: 'p', runs: [{ text: 'old' }] }] } } };
  const empty = { version: 1, blocks: [{ type: 'p', runs: [{ text: '   ' }] }] };
  const next = upsertNoteDocument(notes, 'youtube.com', empty, '2026-10-03T00:00:00.000Z');
  assert.deepEqual(next, {});
});

test('stored v0.1 note records migrate to content plus separate site settings', () => {
  const { migrateStoredData } = require('../shared/state.js');
  const migrated = migrateStoredData(
    { globalVisible: false },
    { 'youtube.com': { text: 'legacy', direction: 'rtl', hidden: false, position: { x: 99, y: 88 }, updatedAt: '2026-10-03T00:00:00.000Z' } },
    {}
  );
  assert.equal(migrated.settings.globalVisible, false);
  assert.equal(migrated.settings.theme, 'light');
  assert.equal(migrated.notes['youtube.com'].document.blocks[0].runs[0].text, 'legacy');
  assert.equal(migrated.sites['youtube.com'].visibility, 'default');
  assert.equal(migrated.sites['youtube.com'].direction, 'rtl');
  assert.deepEqual(migrated.sites['youtube.com'].buttonPosition, { x: 99, y: 88 });
});

test('migration drops empty legacy note content while retaining non-content site metadata', () => {
  const { migrateStoredData } = require('../shared/state.js');
  const migrated = migrateStoredData({}, {
    'youtube.com': { text: '', direction: 'auto', hidden: false, position: { x: 10, y: 20 } }
  }, {});
  assert.equal(migrated.notes['youtube.com'], undefined);
  assert.deepEqual(migrated.sites['youtube.com'].buttonPosition, { x: 10, y: 20 });
});
