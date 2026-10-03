(function (root) {
  const domainApi = typeof module !== 'undefined' ? require('./domain.js') : root.DomainNotesDomain;
  const stateApi = typeof module !== 'undefined' ? require('./state.js') : root.DomainNotesState;
  const richApi = typeof module !== 'undefined' ? require('./richtext.js') : root.DomainNotesRichText;
  const { normalizeSiteInput } = domainApi;
  const { sanitizeSettings, sanitizeSiteRecord, sanitizeNoteRecord } = stateApi;
  const { plainTextToDocument, hasMeaningfulContent } = richApi;

  const SCHEMA_VERSION = 3;

  function assertSafeKey(rawKey) {
    if (rawKey === '__proto__' || rawKey === 'prototype' || rawKey === 'constructor') {
      throw new Error('Invalid backup: unsafe domain key');
    }
  }

  function sanitizeNotes(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid backup: notes must be an object');
    }
    const output = {};
    for (const [rawKey, rawNote] of Object.entries(value)) {
      assertSafeKey(rawKey);
      const domain = normalizeSiteInput(rawKey);
      if (!domain) throw new Error(`Invalid backup: invalid domain "${rawKey}"`);
      const note = sanitizeNoteRecord(rawNote);
      if (note) output[domain] = note;
    }
    return output;
  }

  function sanitizeSites(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid backup: sites must be an object');
    }
    const output = {};
    for (const [rawKey, rawSite] of Object.entries(value)) {
      assertSafeKey(rawKey);
      const domain = normalizeSiteInput(rawKey);
      if (!domain) throw new Error(`Invalid backup: invalid domain "${rawKey}"`);
      output[domain] = sanitizeSiteRecord(rawSite);
    }
    return output;
  }

  function createBackup(settings, notes, sites) {
    return {
      schemaVersion: SCHEMA_VERSION,
      dn_notes: sanitizeNotes(notes || {}),
      dn_sites: sanitizeSites(sites || {}),
      dn_settings: sanitizeSettings(settings)
    };
  }

  function migrateVersion1(value) {
    if (!value.notes || typeof value.notes !== 'object' || Array.isArray(value.notes)) {
      throw new Error('Invalid backup: notes must be an object');
    }
    const notes = {};
    const sites = {};
    for (const [rawKey, rawNote] of Object.entries(value.notes)) {
      assertSafeKey(rawKey);
      const domain = normalizeSiteInput(rawKey);
      if (!domain) throw new Error(`Invalid backup: invalid domain "${rawKey}"`);
      const legacy = rawNote && typeof rawNote === 'object' && !Array.isArray(rawNote) ? rawNote : {};
      const document = plainTextToDocument(typeof legacy.text === 'string' ? legacy.text : '');
      if (hasMeaningfulContent(document)) {
        notes[domain] = { document, updatedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : null };
      }
      sites[domain] = sanitizeSiteRecord({
        visibility: legacy.hidden === true ? 'hide' : 'default',
        direction: legacy.direction,
        buttonPosition: legacy.position,
        panelPosition: null,
        panelSize: null
      });
    }
    return { settings: sanitizeSettings(value.settings), notes, sites };
  }

  function migrateVersion2(value) {
    if (!Object.prototype.hasOwnProperty.call(value, 'notes')) throw new Error('Invalid backup: missing notes');
    if (!Object.prototype.hasOwnProperty.call(value, 'sites')) throw new Error('Invalid backup: missing sites');
    return {
      settings: sanitizeSettings(value.settings),
      notes: sanitizeNotes(value.notes),
      sites: sanitizeSites(value.sites)
    };
  }

  function validateBackup(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid backup: expected an object');
    }
    if (value.version === 1) return migrateVersion1(value);
    if (value.version === 2) return migrateVersion2(value);

    if (value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported backup version: ${value.schemaVersion}`);
    }
    for (const key of ['dn_notes', 'dn_sites', 'dn_settings']) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`Invalid backup: missing ${key}`);
    }
    return {
      settings: sanitizeSettings(value.dn_settings),
      notes: sanitizeNotes(value.dn_notes),
      sites: sanitizeSites(value.dn_sites)
    };
  }

  const api = { SCHEMA_VERSION, createBackup, validateBackup, sanitizeNotes, sanitizeSites, assertSafeKey };
  root.DomainNotesBackup = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
