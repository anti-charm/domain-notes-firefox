const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dom = require('../shared/richtext_dom.js');
const rich = require('../shared/richtext.js');

test('font and size parsing accepts only the editor allow-list', () => {
  assert.equal(dom.fontIdFromCss('serif'), 'serif');
  assert.equal(dom.fontIdFromCss('sans-serif'), 'sans');
  assert.equal(dom.fontIdFromCss('monospace'), 'monospace');
  assert.equal(dom.fontIdFromCss('url(javascript:1)'), null);
  assert.equal(dom.sizeFromCss('24px'), 24);
  assert.equal(dom.sizeFromCss('22px'), null);
  assert.equal(dom.sizeFromCss('24pt'), null);
});

test('safe model preserves neighboring runs and selected-style fields independently', () => {
  const doc = rich.sanitizeDocument({ version: 1, blocks: [{ type: 'p', runs: [
    { text: 'left ', bold: false },
    { text: 'selected', color: '#123456', font: 'serif', size: 24, bold: true },
    { text: ' right', italic: true }
  ] }] });
  assert.equal(doc.blocks[0].runs[0].text, 'left ');
  assert.deepEqual(doc.blocks[0].runs[1], {
    text: 'selected', bold: true, italic: false, underline: false, strike: false,
    color: '#123456', font: 'serif', size: 24
  });
  assert.equal(doc.blocks[0].runs[2].italic, true);
});

test('rich-text DOM helper exposes explicit selection save restore and bullet toggle command', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'richtext_dom.js'), 'utf8');
  assert.match(source, /function saveEditorSelection/);
  assert.match(source, /function restoreEditorSelection/);
  assert.match(source, /insertUnorderedList/);
  assert.match(source, /fontSizePx/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('paste path accepts text plain and never inserts clipboard HTML', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'richtext_dom.js'), 'utf8');
  assert.match(source, /getData\(['"]text\/plain['"]\)/);
  assert.doesNotMatch(source, /getData\(['"]text\/html['"]\)/);
  assert.doesNotMatch(source, /insertHTML/);
});
