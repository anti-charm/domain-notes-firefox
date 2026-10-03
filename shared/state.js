(function (root) {
  const richApi = typeof module !== 'undefined' ? require('./richtext.js') : root.DomainNotesRichText;
  const { sanitizeDocument, hasMeaningfulContent, plainTextToDocument } = richApi;
  const ACCENTS = new Set(['violet', 'blue', 'teal', 'green', 'orange', 'rose']);

  function sanitizeDirection(value) {
    return value === 'ltr' || value === 'rtl' ? value : 'auto';
  }

  function makeDefaultSettings() {
    return { globalVisible: false, theme: 'light', accent: 'violet' };
  }

  function sanitizeSettings(value) {
    const base = makeDefaultSettings();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
    return {
      globalVisible: typeof value.globalVisible === 'boolean' ? value.globalVisible : false,
      theme: value.theme === 'dark' ? 'dark' : 'light',
      accent: ACCENTS.has(value.accent) ? value.accent : 'violet'
    };
  }

  function sanitizePosition(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: Math.round(value.x), y: Math.round(value.y) };
  }

  function sanitizePanelSize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return null;
    return {
      width: Math.min(1200, Math.max(280, Math.round(value.width))),
      height: Math.min(1200, Math.max(220, Math.round(value.height)))
    };
  }

  function makeDefaultSite() {
    return { visibility: 'default', direction: 'auto', buttonPosition: null, panelPosition: null, panelSize: null };
  }

  function sanitizeSiteRecord(value) {
    const base = makeDefaultSite();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
    return {
      visibility: value.visibility === 'show' || value.visibility === 'hide' ? value.visibility : 'default',
      direction: sanitizeDirection(value.direction),
      buttonPosition: sanitizePosition(value.buttonPosition),
      panelPosition: sanitizePosition(value.panelPosition),
      panelSize: sanitizePanelSize(value.panelSize)
    };
  }

  function resolveVisibility(globalVisible, siteVisibility) {
    if (siteVisibility === 'show') return true;
    if (siteVisibility === 'hide') return false;
    return globalVisible !== false;
  }

  function resetLayout(value) {
    const site = sanitizeSiteRecord(value);
    return { ...site, buttonPosition: null, panelPosition: null, panelSize: null };
  }

  function clampPosition(position, width, height, viewportWidth, viewportHeight, margin = 8) {
    const maxX = Math.max(margin, viewportWidth - width - margin);
    const maxY = Math.max(margin, viewportHeight - height - margin);
    const x = Number.isFinite(position?.x) ? position.x : maxX;
    const y = Number.isFinite(position?.y) ? position.y : 72;
    return {
      x: Math.min(maxX, Math.max(margin, Math.round(x))),
      y: Math.min(maxY, Math.max(margin, Math.round(y)))
    };
  }

  function sanitizeNoteRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const document = sanitizeDocument(value.document);
    if (!hasMeaningfulContent(document)) return null;
    return {
      document,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
    };
  }

  function upsertNoteDocument(notes, domain, document, updatedAt) {
    const next = { ...(notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {}) };
    const safeDoc = sanitizeDocument(document);
    if (!hasMeaningfulContent(safeDoc)) {
      delete next[domain];
      return next;
    }
    next[domain] = { document: safeDoc, updatedAt: typeof updatedAt === 'string' ? updatedAt : null };
    return next;
  }

  function migrateStoredData(rawSettings, rawNotes, rawSites) {
    const settings = sanitizeSettings(rawSettings);
    const notes = {};
    const sites = {};
    const sourceNotes = rawNotes && typeof rawNotes === 'object' && !Array.isArray(rawNotes) ? rawNotes : {};
    const sourceSites = rawSites && typeof rawSites === 'object' && !Array.isArray(rawSites) ? rawSites : {};

    for (const [domain, rawSite] of Object.entries(sourceSites)) {
      if (domain === '__proto__' || domain === 'prototype' || domain === 'constructor') continue;
      sites[domain] = sanitizeSiteRecord(rawSite);
    }

    for (const [domain, rawNote] of Object.entries(sourceNotes)) {
      if (domain === '__proto__' || domain === 'prototype' || domain === 'constructor') continue;
      const value = rawNote && typeof rawNote === 'object' && !Array.isArray(rawNote) ? rawNote : {};
      const modern = sanitizeNoteRecord(value);
      if (modern) {
        notes[domain] = modern;
      } else if (typeof value.text === 'string') {
        const document = plainTextToDocument(value.text);
        if (hasMeaningfulContent(document)) {
          notes[domain] = { document, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null };
        }
      }

      if (!Object.prototype.hasOwnProperty.call(sites, domain)) {
        sites[domain] = sanitizeSiteRecord({
          visibility: value.hidden === true ? 'hide' : 'default',
          direction: value.direction,
          buttonPosition: value.position
        });
      }
    }

    return { settings, notes, sites };
  }

  const api = {
    ACCENTS,
    sanitizeDirection,
    makeDefaultSettings,
    sanitizeSettings,
    sanitizePosition,
    sanitizePanelSize,
    makeDefaultSite,
    sanitizeSiteRecord,
    resolveVisibility,
    resetLayout,
    clampPosition,
    sanitizeNoteRecord,
    upsertNoteDocument,
    migrateStoredData
  };
  root.DomainNotesState = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
