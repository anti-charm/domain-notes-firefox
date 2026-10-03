const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScripts() {
  const context = { URL };
  context.globalThis = context;
  vm.createContext(context);
  for (const rel of ['../shared/public_suffixes.js', '../shared/domain.js']) {
    const source = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    vm.runInContext(source, context, { filename: rel });
  }
  return context;
}

test('public suffix data is exported in a browser script context', () => {
  const context = loadBrowserScripts();
  assert.equal(typeof context.DOMAIN_NOTES_PSL_EXACT?.has, 'function');
  assert.equal(context.DOMAIN_NOTES_PSL_EXACT.has('com'), true);
});

test('normalizes YouTube correctly in a browser script context', () => {
  const context = loadBrowserScripts();
  assert.equal(context.DomainNotesDomain.normalizeSiteInput('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(context.DomainNotesDomain.normalizeSiteInput('youtube.com'), 'youtube.com');
});
