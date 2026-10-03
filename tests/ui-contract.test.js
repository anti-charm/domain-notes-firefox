const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('dynamic content injection is background-managed and keeps editor code out of the host page', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.content_scripts, undefined);
  const background = read('background/background.js');
  for (const file of ['shared/public_suffixes.js','shared/domain.js','shared/richtext.js','shared/state.js','content/content.js']) {
    assert.match(background, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(background, /shared\/richtext_dom\.js/);
  assert.match(background, /registerContentScripts/);
});

test('popup exposes three-state site visibility layout reset and global theme controls', () => {
  const html = read('popup/popup.html');
  assert.match(html, /id="siteVisibility"/);
  assert.match(html, /value="default"/);
  assert.match(html, /value="show"/);
  assert.match(html, /value="hide"/);
  assert.match(html, /id="resetLayout"/);
  assert.match(html, /id="theme"/);
  assert.match(html, /value="light"/);
  assert.match(html, /value="dark"/);
  assert.match(html, /id="accent"/);
});

test('options manager includes global theme controls and rich-text toolbar', () => {
  const html = read('options/options.html');
  assert.match(html, /id="theme"/);
  assert.match(html, /id="accent"/);
  assert.match(html, /class="format-toolbar"/);
  assert.match(html, /data-command="bold"/);
  assert.match(html, /data-command="insertUnorderedList"/);
  assert.match(html, /class="text-color"/);
});

test('page host stores only site layout and creates an extension iframe', () => {
  const js = read('content/content.js');
  assert.match(js, /const SITES_KEY = ['"]dn_sites['"]/);
  assert.match(js, /buttonPosition/);
  assert.match(js, /panelPosition/);
  assert.match(js, /panelSize/);
  assert.match(js, /browser\.runtime\.getURL\(['"]widget\/widget\.html['"]\)/);
  assert.match(js, /createElement\(['"]iframe['"]\)/);
});


test('widget editor exposes color font size bullet controls and selection preservation', () => {
  const html = read('widget/widget.html');
  const js = read('widget/widget.js');
  assert.match(html, /class="font-family"/);
  assert.match(html, /class="font-size"/);
  assert.match(html, /class="text-color"/);
  assert.match(html, /data-command="insertUnorderedList"/);
  assert.match(js, /saveEditorSelection/);
  assert.match(js, /restoreEditorSelection/);
  assert.match(js, /browser\.storage\.onChanged/);
  for (const key of ['dn_notes', 'dn_sites', 'dn_settings']) assert.match(js, new RegExp(key));
});

test('widget never sends note data through parent postMessage and renders safe links only in display', () => {
  const js = read('widget/widget.js');
  assert.doesNotMatch(js, /send\([^\n]*(note|document|text|clipboard)/i);
  const dom = read('shared/richtext_dom.js');
  assert.match(dom, /u\.protocol === 'http:' \|\| u\.protocol === 'https:'/);
  assert.match(dom, /a\.rel = 'noopener noreferrer'/);
});

test('options editor matches widget rich-text controls and preserves selection', () => {
  const html = read('options/options.html');
  const js = read('options/options.js');
  assert.match(html, /class="font-family"/);
  assert.match(html, /class="font-size"/);
  assert.match(html, /class="text-color"/);
  assert.match(html, /data-command="insertUnorderedList"/);
  assert.match(js, /saveEditorSelection/);
  assert.match(js, /restoreEditorSelection/);
  assert.match(js, /fontSizePx/);
  assert.match(js, /fontName/);
});

test('popup reset layout writes only site state', () => {
  const js = read('popup/popup.js');
  const resetStart = js.indexOf("$('resetLayout').addEventListener");
  assert.ok(resetStart >= 0);
  const slice = js.slice(resetStart, js.indexOf("$('options').addEventListener", resetStart));
  assert.match(slice, /operation: 'reset-site'/);
  assert.doesNotMatch(slice, /NOTES_KEY/);
  assert.doesNotMatch(slice, /SETTINGS_KEY/);
});

test('options backup uses createBackup and validated restore for all three stores', () => {
  const js = read('options/options.js');
  assert.match(js, /createBackup\(fresh.settings, fresh.notes, fresh.sites\)/);
  assert.match(js, /validateBackup\(/);
  assert.match(js, /operation: 'replace', data: restored/);
  assert.match(js, /cancelPending\(\)/);
});


test('collapsed iframe clips to the circular launcher and expanded iframe restores panel shape', () => {
  const js = read('content/content.js');
  assert.match(js, /function setFrameShape\(collapsed\)/);
  assert.match(js, /borderRadius\s*=\s*collapsed\s*\?\s*['"]50%['"]\s*:\s*['"]0['"]/);
  assert.match(js, /overflow\s*=\s*collapsed\s*\?\s*['"]hidden['"]\s*:\s*['"]visible['"]/);
  const collapsed = js.slice(js.indexOf('function applyCollapsedGeometry'), js.indexOf('function applyExpandedGeometry'));
  const expanded = js.slice(js.indexOf('function applyExpandedGeometry'), js.indexOf('async function persistSite'));
  assert.match(collapsed, /setFrameShape\(true\)/);
  assert.match(expanded, /setFrameShape\(false\)/);
});


test('popup and manager request optional website access only from user actions', () => {
  const popup = read('popup/popup.js');
  const options = read('options/options.js');
  for (const source of [popup, options]) {
    assert.match(source, /browser\.permissions\.request/);
    assert.match(source, /dn:sync-access/);
    assert.match(source, /DomainNotesPermissions/);
  }
});
