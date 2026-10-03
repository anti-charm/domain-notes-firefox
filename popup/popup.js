(async function () {
  const SETTINGS_KEY = 'dn_settings';
  const NOTES_KEY = 'dn_notes';
  const SITES_KEY = 'dn_sites';
  const { normalizeSiteInput } = DomainNotesDomain;
  const { sanitizeSettings, sanitizeSiteRecord, resetLayout, migrateStoredData } = DomainNotesState;
  const { GLOBAL_ORIGINS, originPatternsForDomain } = DomainNotesPermissions;
  const $ = (id) => document.getElementById(id);
  const msg = (key, fallback, substitutions) => browser.i18n.getMessage(key, substitutions) || fallback;
  let globalGranted = false;
  let siteGranted = false;
  const store = DomainNotesStore.createClient(browser);

  function localize() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const text = browser.i18n.getMessage(el.dataset.i18n);
      if (text) el.textContent = text;
    });
    const lang = (browser.i18n.getUILanguage() || '').toLowerCase();
    document.documentElement.dir = /^(he|ar|fa|ur)(-|$)/.test(lang) ? 'rtl' : 'ltr';
  }

  function applyTheme(settings) {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
  }

  async function hasOrigins(origins) {
    if (!origins.length) return false;
    try { return await browser.permissions.contains({ origins }); }
    catch (_) { return false; }
  }

  async function requestOrigins(origins) {
    if (!origins.length) return false;
    const globalRequest = origins.every((origin) => GLOBAL_ORIGINS.includes(origin));
    if (globalGranted || (!globalRequest && siteGranted)) return true;
    // Call request before any asynchronous work to retain the user's activation.
    try { return await browser.permissions.request({ origins }); }
    catch (_) { return false; }
  }

  async function syncAccess(injectExisting = false) {
    try { await browser.runtime.sendMessage({ type: 'dn:sync-access', injectExisting }); }
    catch (_) {}
  }

  localize();
  const migrated = await store({ operation: 'read' });
  let settings = migrated.settings;
  let notes = migrated.notes;
  let sites = migrated.sites;

  $('globalVisible').checked = settings.globalVisible;
  $('theme').value = settings.theme;
  $('accent').value = settings.accent;
  applyTheme(settings);

  async function saveSettings(patch) {
    settings = await store({ operation: 'save-settings', patch });
    $('globalVisible').checked = settings.globalVisible;
    $('theme').value = settings.theme;
    $('accent').value = settings.accent;
    applyTheme(settings);
  }

  let domain = '';
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    domain = normalizeSiteInput(tab?.url || '');
  } catch (_) {}

  async function refreshGlobalPermissionUI() {
    const granted = await hasOrigins(GLOBAL_ORIGINS);
    globalGranted = granted;
    $('grantGlobalAccess').classList.toggle('hidden', granted);
    $('globalPermissionStatus').classList.remove('hidden');
    $('globalPermissionStatus').textContent = granted
      ? msg('accessAllSites', 'Website access: All sites')
      : msg('accessOptional', 'Website access is optional. Enable one site or all sites.');
    return granted;
  }

  async function refreshSitePermissionUI() {
    if (!domain) return false;
    const granted = await hasOrigins(originPatternsForDomain(domain));
    siteGranted = granted;
    $('grantSiteAccess').classList.toggle('hidden', granted);
    $('grantSiteAccess').textContent = msg('enableOnDomain', `Enable on ${domain}`, domain);
    $('sitePermissionStatus').classList.remove('hidden');
    $('sitePermissionStatus').textContent = granted
      ? msg('accessThisSite', 'Website access: This site')
      : msg('sitePermissionOptional', 'Enable this domain to show its note button.');
    return granted;
  }

  $('globalVisible').addEventListener('change', async () => {
    const next = $('globalVisible').checked;
    if (next) {
      const granted = await requestOrigins(GLOBAL_ORIGINS);
      if (!granted) {
        $('globalVisible').checked = false;
        await saveSettings({ globalVisible: false });
        $('globalPermissionStatus').classList.remove('hidden');
        $('globalPermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
        return;
      }
    }
    await saveSettings({ globalVisible: next });
    await syncAccess(next);
    await refreshGlobalPermissionUI();
    await refreshSitePermissionUI();
  });

  $('grantGlobalAccess').addEventListener('click', async () => {
    if (await requestOrigins(GLOBAL_ORIGINS)) {
      await saveSettings({ globalVisible: true });
      await syncAccess(true);
      await refreshGlobalPermissionUI();
      await refreshSitePermissionUI();
    } else {
      $('globalPermissionStatus').classList.remove('hidden');
      $('globalPermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
    }
  });

  $('theme').addEventListener('change', () => saveSettings({ theme: $('theme').value }));
  $('accent').addEventListener('change', () => saveSettings({ accent: $('accent').value }));

  if (domain) {
    $('domain').textContent = domain;
    let site = sanitizeSiteRecord(sites[domain]);
    $('siteVisibility').value = site.visibility;

    $('siteVisibility').addEventListener('change', async () => {
      const previous = site.visibility;
      const requested = $('siteVisibility').value;
      if (requested === 'show') {
        const granted = await requestOrigins(originPatternsForDomain(domain));
        if (!granted) {
          $('siteVisibility').value = previous;
          $('sitePermissionStatus').classList.remove('hidden');
          $('sitePermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
          return;
        }
      }
      ({ site, sites } = await store({ operation: 'save-site', domain, patch: { visibility: requested } }));
      await syncAccess(requested === 'show');
      await refreshSitePermissionUI();
    });

    $('grantSiteAccess').addEventListener('click', async () => {
      if (await requestOrigins(originPatternsForDomain(domain))) {
        ({ site, sites } = await store({ operation: 'save-site', domain, patch: { visibility: 'show' } }));
        $('siteVisibility').value = 'show';
        await syncAccess(true);
        await refreshSitePermissionUI();
      } else {
        $('sitePermissionStatus').classList.remove('hidden');
        $('sitePermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
      }
    });

    $('resetLayout').addEventListener('click', async () => {
      ({ site, sites } = await store({ operation: 'reset-site', domain }));
      $('siteVisibility').value = site.visibility;
      $('resetLayout').textContent = browser.i18n.getMessage('layoutReset') || 'Layout reset';
      setTimeout(() => { $('resetLayout').textContent = browser.i18n.getMessage('resetLayout') || 'Reset position & size'; }, 1000);
    });
  } else {
    document.querySelector('.site-section').classList.add('hidden');
    $('unsupported').classList.remove('hidden');
  }

  $('options').addEventListener('click', () => browser.runtime.openOptionsPage());

  const refreshPermissions = async () => {
    await refreshGlobalPermissionUI();
    await refreshSitePermissionUI();
  };
  browser.permissions.onAdded.addListener(refreshPermissions);
  browser.permissions.onRemoved.addListener(refreshPermissions);
  await refreshGlobalPermissionUI();
  await refreshSitePermissionUI();
})();
