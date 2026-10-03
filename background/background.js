(function () {
  const SETTINGS_KEY = 'dn_settings';
  const SITES_KEY = 'dn_sites';
  const CONTENT_SCRIPT_PREFIX = 'dn-';
  const CONTENT_JS = [
    'shared/browser_api.js',
    'shared/public_suffixes.js',
    'shared/domain.js',
    'shared/richtext.js',
    'shared/state.js',
    'content/content.js'
  ];

  const { sanitizeSettings, sanitizeSiteRecord } = DomainNotesState;
  const { desiredRegistrationSpecs } = DomainNotesPermissions;
  const store = DomainNotesStore.createStore(browser.storage.local);
  let accessTail = Promise.resolve();

  function isOurRegistration(id) {
    return typeof id === 'string' && (id === 'dn-global' || id.startsWith('dn-site-'));
  }

  function visibilityFingerprint(rawSites) {
    const source = rawSites && typeof rawSites === 'object' && !Array.isArray(rawSites) ? rawSites : {};
    return JSON.stringify(Object.keys(source).sort().map((domain) => [domain, sanitizeSiteRecord(source[domain]).visibility]));
  }

  async function readDesiredSpecs() {
    const stored = await browser.storage.local.get([SETTINGS_KEY, SITES_KEY]);
    const settings = sanitizeSettings(stored[SETTINGS_KEY]);
    const sites = stored[SITES_KEY] && typeof stored[SITES_KEY] === 'object' && !Array.isArray(stored[SITES_KEY]) ? stored[SITES_KEY] : {};
    const granted = await browser.permissions.getAll();
    return desiredRegistrationSpecs(settings, sites, new Set(granted.origins || []));
  }

  async function replaceRegistrations(specs) {
    const registered = await browser.scripting.getRegisteredContentScripts();
    const ids = registered.filter((entry) => isOurRegistration(entry.id)).map((entry) => entry.id);
    if (ids.length) await browser.scripting.unregisterContentScripts({ ids });
    if (!specs.length) return;
    await browser.scripting.registerContentScripts(specs.map((spec) => ({
      id: spec.id,
      matches: spec.matches,
      js: CONTENT_JS,
      allFrames: false,
      runAt: 'document_idle',
      persistAcrossSessions: true
    })));
  }

  async function injectExistingTabs(specs) {
    const seen = new Set();
    for (const spec of specs) {
      let tabs = [];
      try {
        tabs = await browser.tabs.query({ url: spec.matches });
      } catch (_) {
        continue;
      }
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id) || seen.has(tab.id)) continue;
        seen.add(tab.id);
        try {
          await browser.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_JS });
        } catch (_) {
          // Firefox blocks privileged/restricted pages even when a broad pattern matches.
        }
      }
    }
  }

  async function performSyncAccess(options = {}) {
    const specs = await readDesiredSpecs();
    await replaceRegistrations(specs);
    if (options.injectExisting === true) await injectExistingTabs(specs);
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.filter(tab => Number.isInteger(tab.id)).map(tab =>
      browser.tabs.sendMessage(tab.id, { type: 'dn:refresh-access' }).catch(() => {})));
    return { registrations: specs.map((spec) => spec.id) };
  }

  function syncAccess(options = {}) {
    const next = accessTail.then(() => performSyncAccess(options));
    accessTail = next.catch(() => {});
    return next;
  }

  async function hostAccess(sender) {
    let domain = '';
    try {
      const url = new URL(sender.url);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      domain = DomainNotesDomain.getRegistrableDomain(url.hostname);
    } catch (_) { return null; }
    if (!domain) return null;
    const origins = DomainNotesPermissions.originPatternsForDomain(domain);
    if (!origins.length) return null;
    const granted = await browser.permissions.contains({ origins });
    return granted ? domain : null;
  }

  async function ensureAuth() {
    return store.enqueue(async () => {
      const raw = await browser.storage.local.get('dn_internal');
      if (/^[0-9a-f]{64}$/.test(raw.dn_internal?.auth || '')) return raw.dn_internal.auth;
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const auth = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
      await browser.storage.local.set({ dn_internal: { auth } });
      return auth;
    });
  }

  browser.runtime.onInstalled.addListener(() => { syncAccess().catch(() => {}); });
  browser.runtime.onStartup.addListener(() => { syncAccess().catch(() => {}); });
  browser.permissions.onAdded.addListener(() => { syncAccess({ injectExisting: true }).catch(() => {}); });
  browser.permissions.onRemoved.addListener(() => { syncAccess().catch(() => {}); });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let relevant = false;
    if (changes[SETTINGS_KEY]) {
      const before = sanitizeSettings(changes[SETTINGS_KEY].oldValue);
      const after = sanitizeSettings(changes[SETTINGS_KEY].newValue);
      relevant ||= before.globalVisible !== after.globalVisible;
    }
    if (changes[SITES_KEY]) {
      relevant ||= visibilityFingerprint(changes[SITES_KEY].oldValue) !== visibilityFingerprint(changes[SITES_KEY].newValue);
    }
    if (relevant) syncAccess().catch(() => {});
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (!message || typeof message !== 'object') return undefined;
    if (sender.id !== browser.runtime.id) return undefined;
    const trusted = DomainNotesStore.isTrustedDocumentSender(sender, browser.runtime.getURL(''));
    if (message.type === 'dn:store' && trusted) {
      return store.execute(message).then(value => ({ ok: true, value }), error => ({ ok: false, error: error.message }));
    }
    if (message.type === 'dn:host-access') return hostAccess(sender).then(domain => ({ allowed: !!domain }));
    if (message.type === 'dn:host-auth') return (async () => {
      if (!await hostAccess(sender)) return '';
      const auth = await ensureAuth();
      return await hostAccess(sender) ? auth : '';
    })();
    if (message.type === 'dn:host-site') {
      return hostAccess(sender).then(domain => {
        if (!domain) return undefined;
        const patch = {};
        for (const key of ['buttonPosition', 'panelPosition', 'panelSize']) {
          if (Object.hasOwn(message.patch || {}, key)) patch[key] = message.patch[key];
        }
        return store.execute({ operation: 'save-site', domain, patch }).then(value => value.site);
      });
    }
    if (message.type === 'dn:sync-access' && trusted) {
      return syncAccess({ injectExisting: message.injectExisting === true });
    }
    return undefined;
  });

  syncAccess().catch(() => {});
})();
