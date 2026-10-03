(function (root) {
  const psl = typeof module !== 'undefined'
    ? require('./public_suffixes.js')
    : root;

  const exact = psl.DOMAIN_NOTES_PSL_EXACT;
  const wildcard = psl.DOMAIN_NOTES_PSL_WILDCARD;
  const exception = psl.DOMAIN_NOTES_PSL_EXCEPTION;

  function normalizeHostname(hostname) {
    let host = String(hostname || '').trim().toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    return host.replace(/\.$/, '');
  }

  function isIp(host) {
    if (host.includes(':')) return /^[0-9a-f:]+$/i.test(host);
    const parts = host.split('.');
    return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  }

  function getRegistrableDomain(hostname) {
    const host = normalizeHostname(hostname);
    if (!host || host === 'localhost' || isIp(host) || !host.includes('.')) return host;

    const labels = host.split('.').filter(Boolean);

    // Exception rules win immediately. For !www.ck the public suffix is ck,
    // therefore the registrable domain is www.ck (the exception itself).
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      if (exception.has(candidate)) return candidate;
    }

    let publicSuffixLabels = 1; // implicit "*" rule
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      const count = labels.length - i;
      if (exact.has(candidate) && count > publicSuffixLabels) {
        publicSuffixLabels = count;
      }
      // '*.foo' matches one label plus the suffix 'foo'.
      if (i + 1 < labels.length) {
        const wildcardBase = labels.slice(i + 1).join('.');
        if (wildcard.has(wildcardBase) && count > publicSuffixLabels) {
          publicSuffixLabels = count;
        }
      }
    }

    if (labels.length <= publicSuffixLabels) return host;
    return labels.slice(-(publicSuffixLabels + 1)).join('.');
  }

  function normalizeSiteInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
      const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
      const url = new URL(value);
      return getRegistrableDomain(url.hostname);
    } catch (_) {
      return '';
    }
  }

  const api = { getRegistrableDomain, normalizeSiteInput, normalizeHostname };
  root.DomainNotesDomain = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
