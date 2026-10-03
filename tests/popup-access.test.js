const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const state = require('../shared/state.js');
const permissions = require('../shared/permissions.js');
const domainApi = require('../shared/domain.js');

async function popup({ origins = [], allowed = true, stored = {}, url = 'https://example.com/' } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  const elements = {};
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const hidden = /class="[^"]*\bhidden\b/.test(match[0]);
    const classes = new Set(hidden ? ['hidden'] : []);
    elements[match[1]] = {
      checked: false, value: '', textContent: '', disabled: false, listeners: {},
      classList: { contains: (c) => classes.has(c), remove: (c) => classes.delete(c), add: (c) => classes.add(c),
        toggle(c, on) { on ? classes.add(c) : classes.delete(c); } },
      addEventListener(type, fn) { this.listeners[type] = fn; }
    };
  }
  const data = structuredClone({ dn_settings: { globalVisible: false, theme: 'light', accent: 'violet' }, dn_sites: {}, dn_notes: {}, ...stored });
  const granted = new Set(origins);
  const requested = [];
  const listeners = {};
  const browser = {
    i18n: { getMessage: () => '', getUILanguage: () => 'en' },
    tabs: { async query() { return [{ id: 7, url }]; } },
    runtime: { async sendMessage(message) {
      if (message.type === 'dn:store') return { ok: true, value: await store.execute(message) };
    }, openOptionsPage() {} },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, structuredClone(data[k])])); },
      async set(value) { Object.assign(data, structuredClone(value)); }
    } },
    permissions: {
      async contains({ origins: patterns }) { return patterns.every(p => granted.has(p) || granted.has(p.startsWith('https:') ? 'https://*/*' : 'http://*/*')); },
      async request({ origins: patterns }) { requested.push([...patterns]); if (allowed) patterns.forEach(p => granted.add(p)); return allowed; },
      onAdded: { addListener(fn) { listeners.added = fn; } },
      onRemoved: { addListener(fn) { listeners.removed = fn; } }
    }
  };
  const storeApi = require('../shared/store.js');
  const store = storeApi.createStore(browser.storage.local);
  const document = { getElementById: id => elements[id], querySelectorAll: () => [], querySelector: () => elements.domain, documentElement: { dataset: {} } };
  const context = vm.createContext({ browser, document, DomainNotesState: state, DomainNotesPermissions: permissions, DomainNotesDomain: domainApi, DomainNotesStore: storeApi });
  await vm.runInContext(fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8'), context);
  return { elements, data, requested, granted, listeners, async click(id) { await elements[id].listeners.click(); } };
}

test('fresh popup offers site and global access without requesting either automatically', async () => {
  const p = await popup();
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), false);
  assert.equal(p.elements.grantGlobalAccess.classList.contains('hidden'), false);
  assert.equal(p.elements.grantSiteAccess.textContent, 'Enable on example.com');
  assert.equal(p.requested.length, 0);
});

test('site enable requests only that domain and persists Always show', async () => {
  const p = await popup();
  await p.click('grantSiteAccess');
  assert.deepEqual(p.requested, [['http://*.example.com/*', 'https://*.example.com/*']]);
  assert.equal(p.data.dn_sites['example.com'].visibility, 'show');
  assert.equal(p.data.dn_settings.globalVisible, false);
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), true);
  assert.equal(p.elements.grantGlobalAccess.classList.contains('hidden'), false);
});

test('denied site access preserves notes and offers another explicit attempt', async () => {
  const p = await popup({ allowed: false });
  const before = structuredClone(p.data);
  await p.click('grantSiteAccess');
  assert.deepEqual(p.data, before);
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), false);
  assert.equal(p.requested.length, 1);
});

test('global enable persists visibility and removes both redundant request buttons', async () => {
  const p = await popup();
  await p.click('grantGlobalAccess');
  assert.deepEqual(p.requested, [['http://*/*', 'https://*/*']]);
  assert.equal(p.data.dn_settings.globalVisible, true);
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), true);
  assert.equal(p.elements.grantGlobalAccess.classList.contains('hidden'), true);
  assert.match(p.elements.globalPermissionStatus.textContent, /All sites/);
});

test('denied global access leaves visibility off and manager usable', async () => {
  const p = await popup({ allowed: false });
  await p.click('grantGlobalAccess');
  assert.equal(p.data.dn_settings.globalVisible, false);
  assert.equal(p.elements.grantGlobalAccess.classList.contains('hidden'), false);
  assert.equal(p.elements.options.disabled, false);
});

test('a revoked grant refreshes the popup without an automatic permission request', async () => {
  const p = await popup({ origins: ['http://*/*', 'https://*/*'] });
  p.granted.clear();
  assert.equal(typeof p.listeners.removed, 'function');
  await p.listeners.removed();
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), false);
  assert.equal(p.elements.grantGlobalAccess.classList.contains('hidden'), false);
  assert.equal(p.requested.length, 0);
});

test('reopening a popup with an existing global grant does not ask again', async () => {
  const p = await popup({ origins: ['http://*/*', 'https://*/*'] });
  p.elements.globalVisible.checked = true;
  await p.elements.globalVisible.listeners.change();
  assert.equal(p.requested.length, 0);
  assert.equal(p.data.dn_settings.globalVisible, true);
});

test('restricted non-website pages offer no site grant', async () => {
  const p = await popup({ url: 'about:config' });
  assert.equal(p.elements.grantSiteAccess.classList.contains('hidden'), true);
  assert.equal(p.requested.length, 0);
});
