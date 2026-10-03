(function (root) {
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  const TRAILING = /[.,!?;:)}\]]+$/;

  function trimTrailingPunctuation(url) {
    let clean = url;
    while (TRAILING.test(clean)) clean = clean.replace(TRAILING, '');
    return clean;
  }

  function extractUrls(text) {
    const matches = String(text || '').match(URL_RE) || [];
    return matches.map(trimTrailingPunctuation);
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function linkifyText(text) {
    const source = String(text || '');
    let out = '';
    let last = 0;
    for (const match of source.matchAll(URL_RE)) {
      const raw = match[0];
      const clean = trimTrailingPunctuation(raw);
      const start = match.index;
      out += escapeHtml(source.slice(last, start));
      const safe = escapeHtml(clean);
      out += `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
      out += escapeHtml(raw.slice(clean.length));
      last = start + raw.length;
    }
    out += escapeHtml(source.slice(last));
    return out.replace(/\n/g, '<br>');
  }

  const api = { extractUrls, linkifyText, escapeHtml };
  root.DomainNotesLinks = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
