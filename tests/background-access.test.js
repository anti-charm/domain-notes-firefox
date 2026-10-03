const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const state = require('../shared/state.js');
const permissions = require('../shared/permissions.js');

function eventStub() { return { addListener(fn) { this.listener = fn; } }; }

async function runBackground({ settings, sites, origins }) {
  const registrations = [];
  const unregistered = [];
  const data = { dn_settings: settings, dn_sites: sites };
  const browser = {
    storage: {
      local: { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); } },
      onChanged: eventStub()
    },
    permissions: {
      async getAll() { return { origins }; },
      async contains({ origins: requested }) { return requested.every(origin => origins.includes(origin) || origins.includes(origin.startsWith('https:') ? 'https://*/*' : 'http://*/*')); },
      onAdded: eventStub(),
      onRemoved: eventStub()
    },
    scripting: {
      async getRegisteredContentScripts() { return []; },
      async unregisterContentScripts(arg) { unregistered.push(arg); },
      async registerContentScripts(arg) { registrations.push(...arg); },
      async executeScript() {}
    },
    tabs: { async query() { return []; } },
    runtime: { id: 'domain-notes@domainnotes-addon', getURL: path => 'moz-extension://test/' + path,
      onInstalled: eventStub(), onStartup: eventStub(), onMessage: eventStub() }
  };
  const context = vm.createContext({ browser, DomainNotesState: state, DomainNotesPermissions: permissions,
    DomainNotesStore: require('../shared/store.js'), DomainNotesDomain: require('../shared/domain.js'),
    crypto: require('node:crypto').webcrypto, URL, console, setTimeout, clearTimeout });
  const source = fs.readFileSync(path.join(__dirname, '..', 'background', 'background.js'), 'utf8');
  vm.runInContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { registrations, unregistered, browser, data };
}

test('background registers only the explicitly granted shown domain when global display is off', async () => {
  const origins = permissions.originPatternsForDomain('youtube.com');
  const { registrations } = await runBackground({
    settings: { globalVisible: false, theme: 'light', accent: 'violet' },
    sites: { 'youtube.com': { visibility: 'show' }, 'example.com': { visibility: 'show' } },
    origins
  });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, permissions.registrationIdForDomain('youtube.com'));
  assert.deepEqual(Array.from(registrations[0].matches), origins);
});

test('simultaneous first-use hosts receive one background-initialized authentication token', async () => {
  const { browser } = await runBackground({ settings: {}, sites: {}, origins: permissions.GLOBAL_ORIGINS });
  const sender = { id: browser.runtime.id, url: 'https://example.com/' };
  const handler = browser.runtime.onMessage.listener;
  const [a, b] = await Promise.all([handler({ type: 'dn:host-auth' }, sender), handler({ type: 'dn:host-auth' }, sender)]);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
});

test('host content and foreign extensions cannot read or mutate the private note store', async () => {
  const { browser } = await runBackground({ settings: {}, sites: {}, origins: permissions.GLOBAL_ORIGINS });
  const handler = browser.runtime.onMessage.listener;
  assert.equal(handler({ type: 'dn:store', operation: 'read' }, { id: browser.runtime.id, url: 'https://example.com/' }), undefined);
  assert.equal(handler({ type: 'dn:store', operation: 'read' }, { id: 'foreign', url: 'moz-extension://test/options/options.html' }), undefined);
});

test('revoked host access returns no authentication or layout-write privilege', async () => {
  const { browser } = await runBackground({ settings: {}, sites: {}, origins: [] });
  const handler = browser.runtime.onMessage.listener;
  const sender = { id: browser.runtime.id, url: 'https://example.com/' };
  assert.equal((await handler({ type: 'dn:host-access' }, sender)).allowed, false);
  assert.equal(await handler({ type: 'dn:host-auth' }, sender), '');
  assert.equal(await handler({ type: 'dn:host-site', patch: { visibility: 'show' } }, sender), undefined);
  for (const url of ['http://[::1]/', 'http://intranet/']) {
    assert.equal((await handler({ type: 'dn:host-access' }, { ...sender, url })).allowed, false);
    assert.equal(await handler({ type: 'dn:host-auth' }, { ...sender, url }), '');
  }
});

test('background registers one global content script only after global origins are granted', async () => {
  const { registrations } = await runBackground({
    settings: { globalVisible: true, theme: 'dark', accent: 'teal' },
    sites: { 'youtube.com': { visibility: 'show' } },
    origins: permissions.GLOBAL_ORIGINS
  });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, 'dn-global');
  assert.deepEqual(Array.from(registrations[0].matches), permissions.GLOBAL_ORIGINS);
});
