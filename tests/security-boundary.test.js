const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('page host contains no note or editor data logic', () => {
  const host = read('content/content.js');
  for (const forbidden of ['dn_notes', 'contenteditable', 'editorToDocument', 'renderDocument', 'clipboardData', 'execCommand', 'foreColor']) {
    assert.doesNotMatch(host, new RegExp(forbidden, 'i'), `host must not contain ${forbidden}`);
  }
  assert.match(host, /dn_sites/);
  assert.match(host, /dn_settings/);
});

test('host accepts messages only from its exact iframe and an allow-listed type set', () => {
  const host = read('content/content.js');
  assert.match(host, /event\.source\s*!==\s*iframe\.contentWindow/);
  for (const type of ['dn:ready', 'dn:expand', 'dn:collapse', 'dn:move', 'dn:resize', 'dn:reset-layout']) {
    assert.match(host, new RegExp(type.replace(':', '\\:')));
  }
  assert.match(host, /ALLOWED_MESSAGE_TYPES/);
});

test('host initializes iframe with only the domain identifier and never note payloads', () => {
  const host = read('content/content.js');
  assert.match(host, /type:\s*['"]dn:init['"]/);
  assert.match(host, /domain/);
  assert.doesNotMatch(host, /postMessage\([^\n]*(note|document|text|clipboard)/i);
});

test('widget is an extension document containing the editor', () => {
  const html = read('widget/widget.html');
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /id="editor"/);
  assert.match(html, /widget\.js/);
});

test('host-to-widget initialization uses exact extension origin and authenticated handshake', () => {
  const host = read('content/content.js');
  const widget = read('widget/widget.js');
  assert.match(host, /widgetOrigin/);
  assert.doesNotMatch(host, /postMessage\(\{ type: 'dn:init'[^\n]*, '\*'\)/);
  assert.match(host, /dn_internal/);
  assert.match(host, /dn:host-auth/);
  assert.match(read('background/background.js'), /crypto\.getRandomValues/);
  assert.match(widget, /message\.auth !== auth/);
});

test('page host content script has a duplicate-injection guard', () => {
  const source = fs.readFileSync(path.join(root, 'content', 'content.js'), 'utf8');
  assert.match(source, /__DOMAIN_NOTES_HOST_ACTIVE__/);
});
