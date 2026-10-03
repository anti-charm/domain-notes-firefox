(function (root) {
  const GLOBAL_ORIGINS = ['http://*/*', 'https://*/*'];

  function isIPv4(value) {
    const parts = String(value || '').split('.');
    return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  }

  function isSafeHost(value) {
    const host = String(value || '').trim().toLowerCase();
    if (!host || host.includes('/') || host.includes('*') || host.includes('..')) return false;
    if (host === 'localhost' || isIPv4(host)) return true;
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && host.includes('.');
  }

  function originPatternsForDomain(domain) {
    const host = String(domain || '').trim().toLowerCase();
    if (!isSafeHost(host)) return [];
    const patternHost = host === 'localhost' || isIPv4(host) ? host : `*.${host}`;
    return [`http://${patternHost}/*`, `https://${patternHost}/*`];
  }

  function registrationIdForDomain(domain) {
    const host = String(domain || '').trim().toLowerCase();
    return `dn-site-${[...host].map(char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`;
  }

  function allPatternsGranted(patterns, grantedOrigins) {
    return patterns.length > 0 && patterns.every((pattern) => grantedOrigins.has(pattern));
  }

  function desiredRegistrationSpecs(settings, sites, grantedOrigins) {
    const safeSettings = settings && typeof settings === 'object' ? settings : {};
    const safeSites = sites && typeof sites === 'object' && !Array.isArray(sites) ? sites : {};
    const granted = grantedOrigins instanceof Set ? grantedOrigins : new Set(grantedOrigins || []);

    const hasGlobalGrant = allPatternsGranted(GLOBAL_ORIGINS, granted);
    if (safeSettings.globalVisible === true && hasGlobalGrant) {
      return [{ id: 'dn-global', domain: null, matches: [...GLOBAL_ORIGINS] }];
    }

    const output = [];
    for (const domain of Object.keys(safeSites).sort()) {
      if (safeSites[domain]?.visibility !== 'show') continue;
      const patterns = originPatternsForDomain(domain);
      if (!patterns.length) continue;
      if (!hasGlobalGrant && !allPatternsGranted(patterns, granted)) continue;
      output.push({ id: registrationIdForDomain(domain), domain, matches: patterns });
    }
    return output;
  }

  const api = { GLOBAL_ORIGINS, originPatternsForDomain, registrationIdForDomain, desiredRegistrationSpecs, isSafeHost };
  root.DomainNotesPermissions = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
