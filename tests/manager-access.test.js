const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('manager requests optional access within the click activation, before awaiting other APIs', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { checked: false, value: '', textContent: '', listeners: {},
      classList: { toggle() {}, remove() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren() {} });
    return nodes.get(id);
  };
  const stored = { dn_settings: { globalVisible: false, theme: 'light', accent: 'violet' }, dn_notes: {}, dn_sites: {} };
  let active = false;
  const requests = [];
  const browser = {
    i18n: { getMessage: () => '', getUILanguage: () => 'en' },
    storage: { local: { async get() { return structuredClone(stored); }, async set(value) { Object.assign(stored, structuredClone(value)); } } },
    permissions: { async contains() { return false; }, async request({ origins }) { requests.push([...origins]); return active; },
      onAdded: { addListener() {} }, onRemoved: { addListener() {} } },
    runtime: { async sendMessage(message) {
      if (message.type === 'dn:store') return { ok: true, value: await store.execute(message) };
    } }
  };
  const storeApi = require('../shared/store.js');
  const store = storeApi.createStore(browser.storage.local);
  const context = vm.createContext({ browser, document: { getElementById: node, querySelectorAll: () => [], documentElement: { dataset: {} } },
    DomainNotesDomain: require('../shared/domain.js'), DomainNotesState: require('../shared/state.js'),
    DomainNotesRichText: require('../shared/richtext.js'), DomainNotesRichTextDOM: {},
    DomainNotesBackup: require('../shared/backup.js'), DomainNotesPermissions: require('../shared/permissions.js'), DomainNotesStore: storeApi, setTimeout, clearTimeout });
  await vm.runInContext(fs.readFileSync(path.join(__dirname, '../options/options.js'), 'utf8'), context);
  node('globalVisible').checked = true;
  active = true;
  const pending = node('globalVisible').listeners.change();
  active = false;
  await pending;
  assert.deepEqual(requests, [['http://*/*', 'https://*/*']]);
  assert.equal(stored.dn_settings.globalVisible, true);
});
