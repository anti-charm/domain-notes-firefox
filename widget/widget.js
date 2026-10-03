(async function () {
  const SETTINGS_KEY = 'dn_settings';
  const NOTES_KEY = 'dn_notes';
  const SITES_KEY = 'dn_sites';
  const INTERNAL_KEY = 'dn_internal';

  const {
    sanitizeSettings,
    sanitizeSiteRecord,
    sanitizeNoteRecord,
    sanitizeDirection,
    upsertNoteDocument,
    migrateStoredData
  } = DomainNotesState;
  const { sanitizeDocument } = DomainNotesRichText;
  const {
    renderDocument,
    renderEditor,
    editorToDocument,
    installPlainTextPaste,
    saveEditorSelection,
    restoreEditorSelection,
    execFormat
  } = DomainNotesRichTextDOM;

  let domain = '';
  let auth = '';
  let settings = sanitizeSettings(null);
  let notes = {};
  let sites = {};
  let note = null;
  let site = sanitizeSiteRecord(null);
  let expanded = false;
  let editing = false;
  let saveTimer = null;
  let savedSelection = null;
  let lastWrittenUpdatedAt = null;
  let movedDuringFabDrag = false;
  const store = DomainNotesStore.createClient(browser);
  let storageState;
  let saveTail = Promise.resolve();

  const $ = (id) => document.getElementById(id);
  const fab = $('fab');
  const panel = $('panel');
  const domainEl = $('domain');
  const collapse = $('collapse');
  const edit = $('edit');
  const done = $('done');
  const direction = $('direction');
  const display = $('display');
  const editor = $('editor');
  const formatToolbar = $('formatToolbar');
  const status = $('status');
  const fontFamily = document.querySelector('.font-family');
  const fontSize = document.querySelector('.font-size');
  const colorInput = document.querySelector('.text-color');
  const dragHandle = $('dragHandle');

  const msg = (key, fallback) => browser.i18n.getMessage(key) || fallback;

  function localize() {
    fab.title = fab.setAttribute('aria-label', msg('openNotes', 'Open domain notes')) || msg('openNotes', 'Open domain notes');
    panel.setAttribute('aria-label', msg('domainNotes', 'Domain Notes'));
    collapse.title = msg('collapse', 'Collapse');
    collapse.setAttribute('aria-label', msg('collapse', 'Collapse'));
    edit.textContent = msg('edit', 'Edit');
    done.textContent = msg('done', 'Done');
    document.querySelector('.direction-wrap span').textContent = msg('direction', 'Direction');
    direction.options[0].textContent = msg('directionAuto', 'Auto');
    formatToolbar.setAttribute('aria-label', msg('formatting', 'Formatting'));
    const titles = {
      bold: msg('bold', 'Bold'),
      italic: msg('italic', 'Italic'),
      underline: msg('underline', 'Underline'),
      strikeThrough: msg('strike', 'Strikethrough'),
      insertUnorderedList: msg('bulletList', 'Bullet list'),
      removeFormat: msg('clearFormatting', 'Clear formatting')
    };
    for (const button of formatToolbar.querySelectorAll('button[data-command]')) {
      button.title = titles[button.dataset.command] || '';
    }
    colorInput.title = msg('textColor', 'Text color');
    colorInput.setAttribute('aria-label', msg('textColor', 'Text color'));
    fontFamily.setAttribute('aria-label', msg('fontFamily', 'Font family'));
    fontFamily.options[0].textContent = msg('fontFamily', 'Font');
    fontSize.setAttribute('aria-label', msg('fontSize', 'Font size'));
    fontSize.options[0].textContent = msg('fontSize', 'Size');
  }

  function send(type, payload = {}) {
    parent.postMessage({ type, ...payload }, '*');
  }

  async function loadAuth() {
    const stored = await browser.storage.local.get(INTERNAL_KEY);
    const value = stored[INTERNAL_KEY];
    auth = value && typeof value.auth === 'string' ? value.auth : '';
  }

  async function loadState() {
    storageState = await store({ operation: 'read' });
    ({ settings, notes, sites } = storageState);
    note = sanitizeNoteRecord(notes[domain]);
    site = sanitizeSiteRecord(sites[domain]);

  }

  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
  }

  function applyDirection() {
    const dir = sanitizeDirection(site.direction);
    direction.value = dir;
    editor.dir = dir;
    display.dir = dir;
  }

  function renderNote() {
    note = sanitizeNoteRecord(notes[domain]);
    if (!note) {
      display.replaceChildren();
      display.textContent = msg('emptyNote', 'No note yet. Select Edit to add one.');
      display.classList.add('empty');
      return;
    }
    display.classList.remove('empty');
    renderDocument(note.document, display, { links: true });
  }

  function showExpanded(value) {
    expanded = value;
    fab.classList.toggle('hidden', value);
    panel.classList.toggle('hidden', !value);
  }

  function setEditing(value) {
    editing = value;
    edit.classList.toggle('hidden', value);
    done.classList.toggle('hidden', !value);
    formatToolbar.classList.toggle('hidden', !value);
    display.classList.toggle('hidden', value);
    editor.classList.toggle('hidden', !value);
    if (value) {
      renderEditor(note?.document || sanitizeDocument(null), editor);
      applyDirection();
      editor.focus();
      savedSelection = saveEditorSelection(editor);
    } else {
      savedSelection = null;
    }
  }

  async function persistSite(patch) {
    if (!domain) return;
    ({ site, sites } = await store({ operation: 'save-site', domain, patch }));
  }

  function persistDocument(documentValue) {
    if (!domain) return;
    const safeDocument = sanitizeDocument(documentValue);
    const next = saveTail.then(async () => {
      const result = await store({ operation: 'save-note', domain, document: safeDocument,
        revision: DomainNotesStore.revisionFor(storageState, domain) });
      notes = result.notes;
      storageState.revisions[domain] = Number(result.revision.split(':')[1]);
      note = sanitizeNoteRecord(notes[domain]);
      lastWrittenUpdatedAt = note?.updatedAt;
    });
    saveTail = next.catch(error => { status.textContent = error.message; throw error; });
    // Event callbacks surface the failure in the editor without unhandled rejections.
    saveTail.catch(() => {});
    return saveTail;
  }

  function scheduleDocumentSave() {
    if (!editing) return;
    clearTimeout(saveTimer);
    status.textContent = msg('saving', 'Saving…');
    saveTimer = setTimeout(async () => {
      try { await persistDocument(editorToDocument(editor)); } catch (_) { return; }
      status.textContent = msg('saved', 'Saved');
      setTimeout(() => {
        if (status.textContent === msg('saved', 'Saved')) status.textContent = '';
      }, 900);
    }, 300);
  }

  async function flushDocumentSave() {
    clearTimeout(saveTimer);
    if (!editing) return;
    await persistDocument(editorToDocument(editor));
  }

  function rememberSelection() {
    const token = saveEditorSelection(editor);
    if (token) savedSelection = token;
  }

  function applyFormat(command, value = null) {
    if (!editing) return;
    const token = savedSelection || saveEditorSelection(editor);
    if (token) restoreEditorSelection(editor, token);
    execFormat(editor, command, value, token);
    savedSelection = saveEditorSelection(editor) || savedSelection;
    scheduleDocumentSave();
  }

  function installToolbar() {
    for (const button of formatToolbar.querySelectorAll('button[data-command]')) {
      button.addEventListener('pointerdown', (event) => {
        rememberSelection();
        event.preventDefault();
      });
      button.addEventListener('click', () => applyFormat(button.dataset.command));
    }

    colorInput.addEventListener('pointerdown', rememberSelection);
    colorInput.addEventListener('focus', rememberSelection);
    colorInput.addEventListener('input', () => applyFormat('foreColor', colorInput.value));

    fontFamily.addEventListener('pointerdown', rememberSelection);
    fontFamily.addEventListener('focus', rememberSelection);
    fontFamily.addEventListener('change', () => {
      if (fontFamily.value) applyFormat('fontName', fontFamily.value);
    });

    fontSize.addEventListener('pointerdown', rememberSelection);
    fontSize.addEventListener('focus', rememberSelection);
    fontSize.addEventListener('change', () => {
      if (fontSize.value) applyFormat('fontSizePx', Number(fontSize.value));
    });
  }

  function installDrag(handle, isFab) {
    let last = null;
    let distance = 0;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (!isFab && event.target.closest('button,select,input,label')) return;
      last = { x: event.screenX, y: event.screenY };
      distance = 0;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!last) return;
      const dx = event.screenX - last.x;
      const dy = event.screenY - last.y;
      last = { x: event.screenX, y: event.screenY };
      distance += Math.abs(dx) + Math.abs(dy);
      send('dn:move', { dx, dy, commit: false });
    });
    const finish = (event) => {
      if (!last) return;
      last = null;
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      send('dn:move', { dx: 0, dy: 0, commit: true });
      if (isFab && distance > 4) movedDuringFabDrag = true;
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function installResize(handle) {
    let last = null;
    const edge = handle.dataset.edge;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      last = { x: event.screenX, y: event.screenY };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!last) return;
      const dx = event.screenX - last.x;
      const dy = event.screenY - last.y;
      last = { x: event.screenX, y: event.screenY };
      send('dn:resize', { edge, dx, dy, commit: false });
    });
    const finish = (event) => {
      if (!last) return;
      last = null;
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      send('dn:resize', { edge, dx: 0, dy: 0, commit: true });
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  async function initializeDomain(nextDomain) {
    if (domain) return;
    domain = nextDomain;
    domainEl.textContent = domain;
    await loadState();
    applyTheme();
    applyDirection();
    renderNote();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || message.type !== 'dn:init' || typeof message.domain !== 'string') return;
    if (!auth || message.auth !== auth || domain) return;
    initializeDomain(message.domain);
  });

  fab.addEventListener('click', () => {
    if (movedDuringFabDrag) { movedDuringFabDrag = false; return; }
    showExpanded(true);
    send('dn:expand');
  });

  collapse.addEventListener('click', async () => {
    try { await flushDocumentSave(); } catch (_) { return; }
    if (editing) {
      renderNote();
      setEditing(false);
    }
    showExpanded(false);
    send('dn:collapse');
  });

  edit.addEventListener('click', async () => { await loadState(); setEditing(true); });
  done.addEventListener('click', async () => {
    try { await flushDocumentSave(); } catch (_) { return; }
    renderNote();
    setEditing(false);
    status.textContent = '';
  });

  editor.addEventListener('input', scheduleDocumentSave);
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('mouseup', rememberSelection);
  document.addEventListener('selectionchange', () => {
    if (editing) rememberSelection();
  });

  direction.addEventListener('change', async () => {
    const dir = sanitizeDirection(direction.value);
    await persistSite({ direction: dir });
    applyDirection();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !domain) return;
    if (changes[SETTINGS_KEY]) {
      settings = sanitizeSettings(changes[SETTINGS_KEY].newValue);
      applyTheme();
    }
    if (changes[SITES_KEY]) {
      sites = changes[SITES_KEY].newValue && typeof changes[SITES_KEY].newValue === 'object' && !Array.isArray(changes[SITES_KEY].newValue)
        ? changes[SITES_KEY].newValue : {};
      site = sanitizeSiteRecord(sites[domain]);
      applyDirection();
    }
    if (changes[NOTES_KEY]) {
      notes = changes[NOTES_KEY].newValue && typeof changes[NOTES_KEY].newValue === 'object' && !Array.isArray(changes[NOTES_KEY].newValue)
        ? changes[NOTES_KEY].newValue : {};
      const incoming = sanitizeNoteRecord(notes[domain]);
      if (incoming?.updatedAt && incoming.updatedAt === lastWrittenUpdatedAt) {
        note = incoming;
        return;
      }
      note = incoming;
      if (!editing) {
        renderNote();
      }
    }
  });

  localize();
  installPlainTextPaste(editor);
  installToolbar();
  installDrag(fab, true);
  installDrag(dragHandle, false);
  for (const handle of document.querySelectorAll('.resize-handle')) installResize(handle);

  await loadAuth();
  showExpanded(false);
  send('dn:ready');
})();
