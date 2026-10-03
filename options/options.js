(async function () {
  const SETTINGS_KEY = 'dn_settings';
  const NOTES_KEY = 'dn_notes';
  const SITES_KEY = 'dn_sites';
  const { normalizeSiteInput } = DomainNotesDomain;
  const {
    sanitizeSettings, sanitizeSiteRecord, sanitizeDirection, sanitizeNoteRecord,
    upsertNoteDocument, migrateStoredData
  } = DomainNotesState;
  const { sanitizeDocument, documentToPlainText } = DomainNotesRichText;
  const { renderEditor, editorToDocument, installPlainTextPaste, saveEditorSelection, restoreEditorSelection, execFormat } = DomainNotesRichTextDOM;
  const { createBackup, validateBackup } = DomainNotesBackup;
  const { GLOBAL_ORIGINS, originPatternsForDomain } = DomainNotesPermissions;
  const $ = (id) => document.getElementById(id);
  const timers = new Map();
  const selections = new WeakMap();
  const editorVersions = new WeakMap();
  const siteAccessRefreshers = new Map();
  const store = DomainNotesStore.createClient(browser);
  const pendingEdits = new Map();
  let storageState;
  let writes = Promise.resolve();
  let settings;
  let notes;
  let sites;
  let draftDomain = '';

  const msg = (key, fallback) => browser.i18n.getMessage(key) || fallback;

  function localize() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const text = browser.i18n.getMessage(el.dataset.i18n);
      if (text) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const text = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
      if (text) el.placeholder = text;
    });
    const lang = (browser.i18n.getUILanguage() || '').toLowerCase();
    document.documentElement.dir = /^(he|ar|fa|ur)(-|$)/.test(lang) ? 'rtl' : 'ltr';
  }

  function applyTheme() {
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
    // Firefox silently accepts existing grants. Request synchronously with the user action.
    try { return await browser.permissions.request({ origins }); }
    catch (_) { return false; }
  }

  async function syncAccess(injectExisting = false) {
    try { await browser.runtime.sendMessage({ type: 'dn:sync-access', injectExisting }); }
    catch (_) {}
  }

  async function refreshGlobalPermissionUI() {
    const granted = await hasOrigins(GLOBAL_ORIGINS);
    const missing = settings?.globalVisible === true && !granted;
    $('grantGlobalAccess').classList.toggle('hidden', !missing);
    $('globalPermissionStatus').classList.toggle('hidden', !missing);
    $('globalPermissionStatus').textContent = missing ? msg('globalAccessMissing', 'Global display is enabled, but website access is not granted on this Firefox installation.') : '';
    return granted;
  }


  async function load() {
    storageState = await store({ operation: 'read' });
    ({ settings, notes, sites } = storageState);
    $('globalVisible').checked = settings.globalVisible;
    $('theme').value = settings.theme;
    $('accent').value = settings.accent;
    applyTheme();
    await render();
    await refreshGlobalPermissionUI();
  }

  async function saveSettings(patch) {
    settings = await store({ operation: 'save-settings', patch });
    $('globalVisible').checked = settings.globalVisible;
    $('theme').value = settings.theme;
    $('accent').value = settings.accent;
    applyTheme();
  }

  async function saveSite(domain, patch, statusEl) {
    ({ sites } = await store({ operation: 'save-site', domain, patch }));
    if (statusEl) showSaved(statusEl);
  }

  async function saveDocument(domain, document, statusEl, version) {
    const result = await store({ operation: 'save-note', domain, document: sanitizeDocument(document),
      revision: version.revision });
    notes = result.notes;
    version.revision = result.revision;
    if (!notes[domain]) draftDomain = domain;
    else if (draftDomain === domain) draftDomain = '';
    if (statusEl) showSaved(statusEl);
    updateCount();
  }

  function showSaved(statusEl) {
    statusEl.textContent = msg('saved', 'Saved');
    setTimeout(() => { if (statusEl.textContent === msg('saved', 'Saved')) statusEl.textContent = ''; }, 900);
  }

  function scheduleSave(domain, editor, statusEl) {
    clearTimeout(timers.get(domain));
    statusEl.textContent = msg('saving', 'Saving…');
    pendingEdits.set(domain, { document: editorToDocument(editor), statusEl, version: editorVersions.get(editor) });
    timers.set(domain, setTimeout(() => flushEditors().catch(error => { statusEl.textContent = error.message; }), 300));
  }

  function cancelPending(domain) {
    const domains = domain ? [domain] : [...pendingEdits.keys()];
    for (const key of domains) {
      clearTimeout(timers.get(key)); timers.delete(key); pendingEdits.delete(key);
    }
  }

  function flushEditors() {
    const next = writes.catch(() => {}).then(async () => {
      for (const [domain, edit] of [...pendingEdits]) {
        if (pendingEdits.get(domain) !== edit) continue;
        clearTimeout(timers.get(domain)); timers.delete(domain);
        try { await saveDocument(domain, edit.document, edit.statusEl, edit.version); }
        catch (error) { edit.statusEl.textContent = error.message; throw error; }
        if (pendingEdits.get(domain) === edit) pendingEdits.delete(domain);
      }
    });
    writes = next;
    return next;
  }

  function domainsForQuery() {
    const all = new Set(Object.keys(notes));
    if (draftDomain) all.add(draftDomain);
    const query = $('search').value.trim().toLocaleLowerCase();
    return [...all].sort((a,b) => a.localeCompare(b)).filter((domain) => {
      if (!query) return true;
      const note = sanitizeNoteRecord(notes[domain]);
      const text = note ? documentToPlainText(note.document) : '';
      return domain.toLocaleLowerCase().includes(query) || text.toLocaleLowerCase().includes(query);
    });
  }

  function updateCount() {
    const query = $('search').value.trim().toLocaleLowerCase();
    const count = Object.keys(notes).filter((domain) => {
      if (!query) return true;
      const note = sanitizeNoteRecord(notes[domain]);
      return domain.toLocaleLowerCase().includes(query) || (note ? documentToPlainText(note.document).toLocaleLowerCase().includes(query) : false);
    }).length;
    $('count').textContent = browser.i18n.getMessage('noteCount', String(count)) || `${count} saved domains`;
    $('empty').classList.toggle('hidden', Object.keys(notes).length !== 0 || !!draftDomain);
  }

  async function render() {
    let fresh;
    try {
      do { await flushEditors(); fresh = await store({ operation: 'read' }); } while (pendingEdits.size);
    } catch (_) { return; }
    storageState = fresh;
    ({ settings, notes, sites } = fresh);
    const domains = domainsForQuery();
    siteAccessRefreshers.clear();
    $('list').replaceChildren();
    updateCount();

    for (const domain of domains) {
      const frag = $('noteCardTemplate').content.cloneNode(true);
      const card = frag.querySelector('.card');
      card.dataset.domain = domain;
      card.querySelector('.card-domain').textContent = domain;
      const status = card.querySelector('.save-status');
      const visibility = card.querySelector('.visibility');
      const direction = card.querySelector('.direction');
      const editor = card.querySelector('.rich-editor');
      editorVersions.set(editor, { revision: DomainNotesStore.revisionFor(storageState, domain) });
      const colorInput = card.querySelector('.text-color');
      const fontFamily = card.querySelector('.font-family');
      const fontSize = card.querySelector('.font-size');
      const del = card.querySelector('.delete');
      const grantSiteAccess = card.querySelector('.grant-site-access');
      const site = sanitizeSiteRecord(sites[domain]);
      const note = sanitizeNoteRecord(notes[domain]);

      card.querySelector('[data-role="visibilityLabel"]').textContent = msg('siteVisibility', 'This site');
      card.querySelector('[data-role="directionLabel"]').textContent = msg('direction', 'Direction');
      const visOpts = visibility.options;
      visOpts[0].textContent = msg('visibilityDefault', 'Use global setting');
      visOpts[1].textContent = msg('visibilityShow', 'Always show');
      visOpts[2].textContent = msg('visibilityHide', 'Always hide');
      direction.options[0].textContent = msg('directionAuto', 'Auto');
      del.textContent = msg('delete', 'Delete');

      visibility.value = site.visibility;
      direction.value = site.direction;
      editor.dir = sanitizeDirection(site.direction);
      renderEditor(note?.document || sanitizeDocument(null), editor);
      installPlainTextPaste(editor);

      const refreshSiteAccess = async () => {
        const currentSite = sanitizeSiteRecord(sites[domain]);
        const granted = await hasOrigins(originPatternsForDomain(domain));
        grantSiteAccess.classList.toggle('hidden', currentSite.visibility !== 'show' || granted);
      };
      siteAccessRefreshers.set(domain, refreshSiteAccess);

      visibility.addEventListener('change', async () => {
        const previous = sanitizeSiteRecord(sites[domain]).visibility;
        const requested = visibility.value;
        if (requested === 'show' && !(await requestOrigins(originPatternsForDomain(domain)))) {
          visibility.value = previous;
          status.textContent = msg('accessNotGranted', 'Website access was not granted.');
          return;
        }
        await saveSite(domain, { visibility: requested }, status);
        await syncAccess(requested === 'show');
        await refreshSiteAccess();
      });

      grantSiteAccess.textContent = msg('grantSiteAccess', 'Grant access to this site');
      grantSiteAccess.addEventListener('click', async () => {
        if (!(await requestOrigins(originPatternsForDomain(domain)))) {
          status.textContent = msg('accessNotGranted', 'Website access was not granted.');
          return;
        }
        visibility.value = 'show';
        await saveSite(domain, { visibility: 'show' }, status);
        await syncAccess(true);
        await refreshSiteAccess();
      });
      direction.addEventListener('change', () => {
        const dir = sanitizeDirection(direction.value);
        editor.dir = dir;
        saveSite(domain, { direction: dir }, status);
      });
      editor.addEventListener('input', () => scheduleSave(domain, editor, status));

      const rememberSelection = () => {
        const token = saveEditorSelection(editor);
        if (token) selections.set(editor, token);
      };
      const applyFormat = (command, value = null) => {
        const token = selections.get(editor) || saveEditorSelection(editor);
        if (token) restoreEditorSelection(editor, token);
        execFormat(editor, command, value, token);
        const next = saveEditorSelection(editor);
        if (next) selections.set(editor, next);
        scheduleSave(domain, editor, status);
      };
      editor.addEventListener('keyup', rememberSelection);
      editor.addEventListener('mouseup', rememberSelection);

      for (const button of card.querySelectorAll('.format-toolbar button[data-command]')) {
        button.title = ({ bold:msg('bold','Bold'), italic:msg('italic','Italic'), underline:msg('underline','Underline'), strikeThrough:msg('strike','Strikethrough'), insertUnorderedList:msg('bulletList','Bullet list'), removeFormat:msg('clearFormatting','Clear formatting') })[button.dataset.command] || '';
        button.addEventListener('pointerdown', (event) => { rememberSelection(); event.preventDefault(); });
        button.addEventListener('click', () => applyFormat(button.dataset.command));
      }
      colorInput.title = msg('textColor', 'Text color');
      colorInput.setAttribute('aria-label', msg('textColor', 'Text color'));
      colorInput.addEventListener('pointerdown', rememberSelection);
      colorInput.addEventListener('focus', rememberSelection);
      colorInput.addEventListener('input', () => applyFormat('foreColor', colorInput.value));

      fontFamily.setAttribute('aria-label', msg('fontFamily', 'Font family'));
      fontFamily.options[0].textContent = msg('fontFamily', 'Font');
      fontFamily.addEventListener('pointerdown', rememberSelection);
      fontFamily.addEventListener('focus', rememberSelection);
      fontFamily.addEventListener('change', () => { if (fontFamily.value) applyFormat('fontName', fontFamily.value); });

      fontSize.setAttribute('aria-label', msg('fontSize', 'Font size'));
      fontSize.options[0].textContent = msg('fontSize', 'Size');
      fontSize.addEventListener('pointerdown', rememberSelection);
      fontSize.addEventListener('focus', rememberSelection);
      fontSize.addEventListener('change', () => { if (fontSize.value) applyFormat('fontSizePx', Number(fontSize.value)); });

      del.addEventListener('click', async () => {
        if (!notes[domain]) { cancelPending(domain); if (draftDomain === domain) draftDomain = ''; render(); return; }
        if (!confirm(browser.i18n.getMessage('confirmDelete', domain) || `Delete the note for ${domain}?`)) return;
        cancelPending(domain);
        await writes.catch(() => {});
        storageState = await store({ operation: 'delete-note', domain });
        notes = storageState.notes;
        if (draftDomain === domain) draftDomain = '';
        render();
      });

      $('list').append(frag);
      refreshSiteAccess();
    }
  }

  localize();
  await load();
  $('globalVisible').addEventListener('change', async () => {
    const next = $('globalVisible').checked;
    if (next && !(await requestOrigins(GLOBAL_ORIGINS))) {
      $('globalVisible').checked = false;
      await saveSettings({ globalVisible: false });
      $('globalPermissionStatus').classList.remove('hidden');
      $('globalPermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
      return;
    }
    await saveSettings({ globalVisible: next });
    await syncAccess(next);
    await refreshGlobalPermissionUI();
    render();
  });
  $('grantGlobalAccess').addEventListener('click', async () => {
    if (await requestOrigins(GLOBAL_ORIGINS)) {
      await saveSettings({ globalVisible: true });
      await syncAccess(true);
      await refreshGlobalPermissionUI();
      render();
    } else {
      $('globalPermissionStatus').classList.remove('hidden');
      $('globalPermissionStatus').textContent = msg('accessNotGranted', 'Website access was not granted.');
    }
  });
  $('theme').addEventListener('change', () => saveSettings({ theme: $('theme').value }));
  $('accent').addEventListener('change', () => saveSettings({ accent: $('accent').value }));
  $('search').addEventListener('input', render);

  $('addBtn').addEventListener('click', async () => {
    const domain = normalizeSiteInput($('newDomain').value);
    if (!domain) { $('addStatus').textContent = msg('invalidDomain', 'Enter a valid domain or URL.'); return; }
    draftDomain = notes[domain] ? '' : domain;
    $('newDomain').value = ''; $('addStatus').textContent = ''; $('search').value = '';
    await render();
    const card = [...document.querySelectorAll('.card')].find((c) => c.dataset.domain === domain);
    card?.querySelector('.rich-editor')?.focus();
    card?.scrollIntoView({ block: 'nearest' });
  });
  $('newDomain').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('addBtn').click(); });

  $('exportBtn').addEventListener('click', async () => {
    try { await flushEditors(); } catch (error) { alert(error.message); return; }
    const fresh = await store({ operation: 'read' });
    const backup = createBackup(fresh.settings, fresh.notes, fresh.sites);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `domain-notes-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const file = $('importFile').files?.[0]; $('importFile').value = '';
    if (!file) return;
    try {
      const restored = validateBackup(JSON.parse(await file.text()));
      if (!confirm(msg('confirmImport', 'Replace current Domain Notes data with this backup?'))) return;
      cancelPending();
      await writes.catch(() => {});
      storageState = await store({ operation: 'replace', data: restored });
      settings = restored.settings; notes = restored.notes; sites = restored.sites; draftDomain = '';
      $('globalVisible').checked = settings.globalVisible; $('theme').value = settings.theme; $('accent').value = settings.accent;
      applyTheme(); render(); await refreshGlobalPermissionUI(); await syncAccess(false); alert(msg('importSuccess', 'Backup imported.'));
    } catch (error) {
      alert(`${msg('importFailed', 'Import failed')}: ${error.message}`);
    }
  });

  const refreshPermissions = async () => {
    await refreshGlobalPermissionUI();
    await Promise.all([...siteAccessRefreshers.values()].map(refresh => refresh()));
  };
  browser.permissions.onAdded.addListener(refreshPermissions);
  browser.permissions.onRemoved.addListener(refreshPermissions);

})();
