const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('paste and drop block native HTML and accept only plain text', () => {
  const inserted = [];
  const listeners = {};
  const context = vm.createContext({ DomainNotesRichText: require('../shared/richtext.js'),
    document: { execCommand: (command, showUI, text) => inserted.push([command, text]) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/richtext_dom.js'), 'utf8'), context);
  context.DomainNotesRichTextDOM.installPlainTextPaste({ addEventListener: (type, fn) => { listeners[type] = fn; }, focus() {} });
  for (const type of ['paste', 'drop']) {
    let prevented = false;
    const transfer = { getData(format) { assert.equal(format, 'text/plain'); return 'safe text'; } };
    assert.equal(typeof listeners[type], 'function');
    listeners[type]({ preventDefault() { prevented = true; }, clipboardData: transfer, dataTransfer: transfer });
    assert.equal(prevented, true);
  }
  assert.deepEqual(inserted, [['insertText', 'safe text'], ['insertText', 'safe text']]);
});
