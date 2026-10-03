const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GLOBAL_ORIGINS,
  originPatternsForDomain,
  registrationIdForDomain,
  desiredRegistrationSpecs
} = require('../shared/permissions.js');

test('global optional origins are HTTP and HTTPS only', () => {
  assert.deepEqual(GLOBAL_ORIGINS, ['http://*/*', 'https://*/*']);
});

test('normal domains get root-and-subdomain HTTP/HTTPS patterns', () => {
  assert.deepEqual(originPatternsForDomain('youtube.com'), [
    'http://*.youtube.com/*',
    'https://*.youtube.com/*'
  ]);
});

test('localhost and IPv4 use exact host patterns', () => {
  assert.deepEqual(originPatternsForDomain('localhost'), ['http://localhost/*', 'https://localhost/*']);
  assert.deepEqual(originPatternsForDomain('127.0.0.1'), ['http://127.0.0.1/*', 'https://127.0.0.1/*']);
});

test('unsafe domain strings produce no permission patterns', () => {
  assert.deepEqual(originPatternsForDomain('evil.com/path'), []);
  assert.deepEqual(originPatternsForDomain('*.evil.com'), []);
  assert.deepEqual(originPatternsForDomain(''), []);
});

test('site registration IDs are stable and contain no unsafe separators', () => {
  assert.equal(registrationIdForDomain('youtube.com'), registrationIdForDomain('youtube.com'));
  assert.match(registrationIdForDomain('news.bbc.co.uk'), /^dn-site-[a-z0-9-]+$/);
});

test('distinct valid domains never collide after punctuation encoding', () => {
  assert.notEqual(registrationIdForDomain('notes.co.uk'), registrationIdForDomain('notes-co.uk'));
});

test('invalid sites never create empty content-script match sets with a retained global grant', () => {
  assert.deepEqual(desiredRegistrationSpecs({ globalVisible: false }, { '::1': { visibility: 'show' } }, new Set(GLOBAL_ORIGINS)), []);
});

test('desired registrations prefer one global script over redundant site scripts', () => {
  const settings = { globalVisible: true };
  const sites = {
    'youtube.com': { visibility: 'show' },
    'example.com': { visibility: 'show' }
  };
  const granted = new Set(GLOBAL_ORIGINS);
  const specs = desiredRegistrationSpecs(settings, sites, granted);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].id, 'dn-global');
});

test('when global display is off, only explicitly shown and granted sites register', () => {
  const settings = { globalVisible: false };
  const sites = {
    'youtube.com': { visibility: 'show' },
    'example.com': { visibility: 'hide' },
    'mozilla.org': { visibility: 'default' }
  };
  const granted = new Set(originPatternsForDomain('youtube.com'));
  const specs = desiredRegistrationSpecs(settings, sites, granted);
  assert.deepEqual(specs.map((s) => s.domain), ['youtube.com']);
});

test('a retained global grant can power an explicitly shown site while global display is off', () => {
  const specs = desiredRegistrationSpecs(
    { globalVisible: false },
    { 'youtube.com': { visibility: 'show' } },
    new Set(GLOBAL_ORIGINS)
  );
  assert.deepEqual(specs.map((s) => s.domain), ['youtube.com']);
});
