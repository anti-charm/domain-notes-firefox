const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest is Firefox MV3, privacy-minimized, and uses runtime host permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
  assert.equal(manifest.incognito, 'not_allowed');
  assert.equal(manifest.browser_specific_settings.gecko.id, 'domain-notes@domainnotes-addon');
  assert.deepEqual(manifest.permissions, ['storage', 'scripting', 'activeTab']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.browser_specific_settings.gecko_android, undefined);
});

test('manifest exposes only widget entry document to web pages and uses strict extension CSP', () => {
  const resources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
  assert.deepEqual(resources, ['widget/widget.html']);
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'none';/);
  assert.match(csp, /img-src 'self';/);
  assert.doesNotMatch(csp.split(';').find(rule => rule.trim().startsWith('script-src')), /https?:|unsafe-eval|unsafe-inline/);
});

test('every manifest-referenced local file exists', () => {
  const files = new Set();
  Object.values(manifest.icons || {}).forEach((f) => files.add(f));
  Object.values(manifest.action?.default_icon || {}).forEach((f) => files.add(f));
  files.add(manifest.action.default_popup);
  files.add(manifest.options_ui.page);
  for (const f of manifest.background?.scripts || []) files.add(f);
  for (const script of manifest.content_scripts || []) for (const f of script.js || []) files.add(f);
  for (const entry of manifest.web_accessible_resources || []) for (const f of entry.resources || []) files.add(f);
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
});

test('English Hebrew and Arabic locales expose the same message keys', () => {
  const locales = ['en', 'he', 'ar'].map((lang) => JSON.parse(fs.readFileSync(path.join(root, '_locales', lang, 'messages.json'), 'utf8')));
  const expected = Object.keys(locales[0]).sort();
  for (const locale of locales.slice(1)) assert.deepEqual(Object.keys(locale).sort(), expected);
});
