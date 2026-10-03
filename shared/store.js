(function (root) {
  const state = root.DomainNotesState || (typeof require !== 'undefined' && require('./state.js'));
  const permissions = root.DomainNotesPermissions || (typeof require !== 'undefined' && require('./permissions.js'));
  const KEYS = ['dn_settings', 'dn_notes', 'dn_sites', 'dn_revisions'];

  function isTrustedDocumentSender(sender, base) {
    return ['options/options.html', 'popup/popup.html', 'widget/widget.html'].some(path => sender?.url === base + path);
  }

  function revisionFor(data, domain) {
    return `${data.epoch || 0}:${data.revisions?.[domain] || 0}`;
  }

  function createStore(local) {
    let tail = Promise.resolve();
    const enqueue = task => {
      const next = tail.then(task);
      tail = next.catch(() => {});
      return next;
    };
    async function read() {
      const raw = await local.get(KEYS);
      const data = state.migrateStoredData(raw.dn_settings, raw.dn_notes, raw.dn_sites);
      const meta = raw.dn_revisions || {};
      data.epoch = Number.isSafeInteger(meta.epoch) ? meta.epoch : 0;
      data.revisions = meta.notes && typeof meta.notes === 'object' && !Array.isArray(meta.notes) ? meta.notes : {};
      return data;
    }
    async function write(data) {
      await local.set({ dn_settings: data.settings, dn_notes: data.notes, dn_sites: data.sites,
        dn_revisions: { epoch: data.epoch, notes: data.revisions } });
    }
    function execute(command) {
      return enqueue(async () => {
        const data = await read();
        if (command.operation === 'read') return data;
        const domain = command.domain;
        if (['save-note', 'delete-note', 'save-site', 'reset-site'].includes(command.operation) && !permissions.isSafeHost(domain)) {
          throw new Error('Invalid domain');
        }
        switch (command.operation) {
          case 'save-note':
            if (command.revision !== revisionFor(data, domain)) {
              throw new Error('Note changed in another window. Copy your text before reloading.');
            }
            data.notes = state.upsertNoteDocument(data.notes, domain, command.document, new Date().toISOString());
            data.revisions[domain] = (data.revisions[domain] || 0) + 1;
            break;
          case 'delete-note':
            delete data.notes[domain];
            data.revisions[domain] = (data.revisions[domain] || 0) + 1;
            break;
          case 'save-site':
            data.sites[domain] = state.sanitizeSiteRecord({ ...state.sanitizeSiteRecord(data.sites[domain]), ...command.patch });
            break;
          case 'reset-site':
            data.sites[domain] = state.resetLayout(data.sites[domain]);
            break;
          case 'save-settings':
            data.settings = state.sanitizeSettings({ ...data.settings, ...command.patch });
            break;
          case 'replace': {
            const safe = state.migrateStoredData(command.data.settings, command.data.notes, command.data.sites);
            Object.assign(data, safe, { epoch: data.epoch + 1, revisions: {} });
            break;
          }
          default: throw new Error('Unknown storage operation');
        }
        await write(data);
        if (command.operation === 'save-note') return { notes: data.notes, revision: revisionFor(data, domain) };
        if (command.operation === 'save-site' || command.operation === 'reset-site') return { sites: data.sites, site: data.sites[domain] };
        if (command.operation === 'save-settings') return data.settings;
        return data;
      });
    }
    return { execute, enqueue };
  }

  function createClient(browser) {
    return async command => {
      const result = await browser.runtime.sendMessage({ type: 'dn:store', ...command });
      if (!result?.ok) throw new Error(result?.error || 'Unable to save Domain Notes data.');
      return result.value;
    };
  }

  const api = { createStore, createClient, revisionFor, isTrustedDocumentSender };
  root.DomainNotesStore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
