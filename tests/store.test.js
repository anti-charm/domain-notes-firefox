const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, isTrustedDocumentSender } = require('../shared/store.js');
const { plainTextToDocument, documentToPlainText } = require('../shared/richtext.js');

function fixture() {
  const data = {};
  const local = {
    async get() { await Promise.resolve(); return structuredClone(data); },
    async set(value) { await Promise.resolve(); Object.assign(data, structuredClone(value)); }
  };
  return createStore(local);
}
const save = (domain, text, revision = '0:0') => ({ operation: 'save-note', domain, document: plainTextToDocument(text), revision });

test('simultaneous saves from different extension windows preserve both notes', async () => {
  const store = fixture();
  await Promise.all([store.execute(save('a.example', 'A')), store.execute(save('b.example', 'B'))]);
  const state = await store.execute({ operation: 'read' });
  assert.equal(documentToPlainText(state.notes['a.example'].document), 'A');
  assert.equal(documentToPlainText(state.notes['b.example'].document), 'B');
});

test('a delayed save cannot resurrect a deleted note', async () => {
  const store = fixture();
  const result = await store.execute(save('a.example', 'A'));
  await store.execute({ operation: 'delete-note', domain: 'a.example' });
  await assert.rejects(store.execute(save('a.example', 'stale', result.revision)), /changed in another window/);
  assert.equal((await store.execute({ operation: 'read' })).notes['a.example'], undefined);
});

test('import invalidates old editors even when the backup has identical timestamps', async () => {
  const store = fixture();
  const result = await store.execute(save('a.example', 'A'));
  const state = await store.execute({ operation: 'read' });
  await store.execute({ operation: 'replace', data: state });
  await assert.rejects(store.execute(save('a.example', 'stale', result.revision)), /changed in another window/);
});

test('same-domain simultaneous editors detect a conflict without overwriting the first save', async () => {
  const store = fixture();
  const results = await Promise.allSettled([store.execute(save('a.example', 'first')), store.execute(save('a.example', 'second'))]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(documentToPlainText((await store.execute({ operation: 'read' })).notes['a.example'].document), 'first');
});

test('site and settings patches merge instead of losing other window changes', async () => {
  const store = fixture();
  await Promise.all([
    store.execute({ operation: 'save-site', domain: 'a.example', patch: { visibility: 'show' } }),
    store.execute({ operation: 'save-site', domain: 'a.example', patch: { direction: 'rtl' } }),
    store.execute({ operation: 'save-settings', patch: { theme: 'dark' } }),
    store.execute({ operation: 'save-settings', patch: { accent: 'blue' } })
  ]);
  const state = await store.execute({ operation: 'read' });
  assert.equal(state.sites['a.example'].visibility, 'show');
  assert.equal(state.sites['a.example'].direction, 'rtl');
  assert.equal(state.settings.theme, 'dark');
  assert.equal(state.settings.accent, 'blue');
});

test('only exact bundled extension documents can access the note store', () => {
  const base = 'moz-extension://random-uuid/';
  for (const path of ['options/options.html', 'popup/popup.html', 'widget/widget.html']) {
    assert.equal(isTrustedDocumentSender({ url: base + path }, base), true);
  }
  for (const url of ['https://example.com/', base + 'unknown.html', base + 'options/options.html.evil', 'moz-extension://other/options/options.html']) {
    assert.equal(isTrustedDocumentSender({ url }, base), false);
  }
  assert.equal(isTrustedDocumentSender({}, base), false);
});
