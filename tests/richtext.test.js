const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FONTS,
  SIZES,
  sanitizeFont,
  sanitizeSize,
  sanitizeDocument,
  plainTextToDocument,
  documentToPlainText,
  hasMeaningfulContent,
  normalizeHexColor
} = require('../shared/richtext.js');

test('plain text migrates to a structured document without losing line breaks', () => {
  const doc = plainTextToDocument('hello\nשלום');
  assert.equal(documentToPlainText(doc), 'hello\nשלום');
  assert.equal(hasMeaningfulContent(doc), true);
});

test('whitespace-only rich documents are not meaningful notes', () => {
  assert.equal(hasMeaningfulContent({ version: 1, blocks: [{ type: 'p', runs: [{ text: ' \n\t ' }] }] }), false);
});

test('sanitizer keeps only supported marks and safe six-digit hex colors', () => {
  const doc = sanitizeDocument({ version: 1, blocks: [{
    type: 'p',
    runs: [{ text: '<img src=x onerror=alert(1)>', bold: true, italic: 1, underline: false, strike: true, color: 'javascript:alert(1)', onclick: 'bad' }]
  }] });
  assert.deepEqual(doc.blocks[0].runs[0], {
    text: '<img src=x onerror=alert(1)>', bold: true, italic: false, underline: false, strike: true, color: null, font: null, size: null
  });
});

test('hex color normalization is strict and canonical', () => {
  assert.equal(normalizeHexColor('#Aa00fF'), '#aa00ff');
  assert.equal(normalizeHexColor('#fff'), null);
  assert.equal(normalizeHexColor('red'), null);
  assert.equal(normalizeHexColor('url(javascript:1)'), null);
});

test('unsupported block types are converted to harmless paragraphs', () => {
  const doc = sanitizeDocument({ version: 1, blocks: [{ type: 'script', runs: [{ text: 'alert(1)' }] }] });
  assert.equal(doc.blocks[0].type, 'p');
  assert.equal(documentToPlainText(doc), 'alert(1)');
});

test('font and size allow-lists are fixed and strict', () => {
  assert.deepEqual(FONTS, ['sans', 'serif', 'monospace']);
  assert.deepEqual(SIZES, [12, 14, 16, 18, 20, 24, 28, 32]);
  assert.equal(sanitizeFont('serif'), 'serif');
  assert.equal(sanitizeFont('url(javascript:1)'), null);
  assert.equal(sanitizeSize(24), 24);
  assert.equal(sanitizeSize(22), null);
  assert.equal(sanitizeSize('24px'), null);
});

test('sanitizer keeps only allow-listed fonts and bounded font sizes', () => {
  const doc = sanitizeDocument({ version: 1, blocks: [{ type: 'p', runs: [
    { text: 'safe', font: 'serif', size: 24 },
    { text: 'bad-font', font: 'url(javascript:1)', size: 999 },
    { text: 'bad-size', font: 'monospace', size: '24px' },
    { text: 'old-run', bold: true, color: '#abcdef' }
  ] }] });
  assert.equal(doc.blocks[0].runs[0].font, 'serif');
  assert.equal(doc.blocks[0].runs[0].size, 24);
  assert.equal(doc.blocks[0].runs[1].font, null);
  assert.equal(doc.blocks[0].runs[1].size, null);
  assert.equal(doc.blocks[0].runs[2].font, 'monospace');
  assert.equal(doc.blocks[0].runs[2].size, null);
  assert.equal(doc.blocks[0].runs[3].font, null);
  assert.equal(doc.blocks[0].runs[3].size, null);
  assert.equal(doc.blocks[0].runs[3].bold, true);
  assert.equal(doc.blocks[0].runs[3].color, '#abcdef');
});

test('lists and formatting round-trip through sanitizer unchanged', () => {
  const original = { version: 1, blocks: [{ type: 'ul', items: [[{
    text: 'item', bold: true, italic: true, underline: true, strike: true,
    color: '#123456', font: 'sans', size: 18
  }]] }] };
  assert.deepEqual(sanitizeDocument(original), original);
});
