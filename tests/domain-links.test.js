const test = require('node:test');
const assert = require('node:assert/strict');
const { getRegistrableDomain, normalizeSiteInput } = require('../shared/domain.js');
const { extractUrls, linkifyText } = require('../shared/links.js');

test('groups subdomains under registrable domain', () => {
  assert.equal(getRegistrableDomain('m.youtube.com'), 'youtube.com');
  assert.equal(getRegistrableDomain('www.youtube.com'), 'youtube.com');
});

test('handles multi-level and private public suffixes', () => {
  assert.equal(getRegistrableDomain('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(getRegistrableDomain('kobi.github.io'), 'kobi.github.io');
});

test('handles wildcard and exception public suffix rules', () => {
  assert.equal(getRegistrableDomain('a.b.ck'), 'a.b.ck');
  assert.equal(getRegistrableDomain('www.ck'), 'www.ck');
});

test('normalizes a URL or bare hostname', () => {
  assert.equal(normalizeSiteInput('https://m.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeSiteInput('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(normalizeSiteInput(''), '');
});

test('extracts http and https URLs from note text', () => {
  assert.deepEqual(extractUrls('see https://example.com/a and http://test.org/x.'), [
    'https://example.com/a',
    'http://test.org/x'
  ]);
});

test('linkify escapes HTML and only creates safe anchors', () => {
  const html = linkifyText('<img src=x onerror=alert(1)> https://example.com?q=1&x=2');
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /https:\/\/example\.com\?q=1&amp;x=2/);
});

test('leaves localhost and IP addresses intact', () => {
  assert.equal(getRegistrableDomain('localhost'), 'localhost');
  assert.equal(getRegistrableDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(getRegistrableDomain('[::1]'), '::1');
});
