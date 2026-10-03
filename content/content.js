(async function () {
  if (window.top !== window) return;
  if (globalThis.__DOMAIN_NOTES_HOST_ACTIVE__) return;
  globalThis.__DOMAIN_NOTES_HOST_ACTIVE__ = true;

  const { getRegistrableDomain } = DomainNotesDomain;
  const { sanitizeSettings, sanitizeSiteRecord, resolveVisibility, resetLayout, clampPosition } = DomainNotesState;

  const domain = getRegistrableDomain(location.hostname);
  if (!domain) return;

  const SETTINGS_KEY = 'dn_settings';
  const SITES_KEY = 'dn_sites';
  const INTERNAL_KEY = 'dn_internal';
  const FAB_SIZE = 44;
  const DEFAULT_PANEL = { width: 540, height: 360 };
  const MIN_PANEL = { width: 280, height: 220 };
  const MARGIN = 8;
  const ALLOWED_MESSAGE_TYPES = new Set(['dn:ready', 'dn:expand', 'dn:collapse', 'dn:move', 'dn:resize', 'dn:reset-layout']);
  const RESIZE_EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  const widgetUrl = browser.runtime.getURL('widget/widget.html');
  const originMatch = widgetUrl.match(/^(?:moz|chrome)-extension:\/\/[^/]+/);
  const widgetOrigin = originMatch ? originMatch[0] : '';

  let settings = sanitizeSettings(null);
  let sites = {};
  let site = sanitizeSiteRecord(null);
  let iframe = null;
  let expanded = false;
  let sessionAuth = '';
  let accessGeneration = 0;

  async function refreshAccess() {
    const generation = ++accessGeneration;
    const auth = await ensureInternalAuth();
    if (generation !== accessGeneration) return;
    sessionAuth = auth || '';
    reconcileVisibility();
  }

  async function ensureInternalAuth() {
    return browser.runtime.sendMessage({ type: 'dn:host-auth' });
  }

  async function loadHostState() {
    const stored = await browser.storage.local.get([SETTINGS_KEY, SITES_KEY]);
    settings = sanitizeSettings(stored[SETTINGS_KEY]);
    sites = stored[SITES_KEY] && typeof stored[SITES_KEY] === 'object' && !Array.isArray(stored[SITES_KEY]) ? stored[SITES_KEY] : {};
    site = sanitizeSiteRecord(sites[domain]);
  }

  function isVisible() {
    return !!sessionAuth && resolveVisibility(settings.globalVisible, site.visibility);
  }

  function defaultButtonPosition() {
    return clampPosition({ x: innerWidth - FAB_SIZE - 16, y: 72 }, FAB_SIZE, FAB_SIZE, innerWidth, innerHeight, MARGIN);
  }

  function safePanelSize() {
    const saved = site.panelSize || DEFAULT_PANEL;
    const maxWidth = Math.max(MIN_PANEL.width, innerWidth - MARGIN * 2);
    const maxHeight = Math.max(MIN_PANEL.height, innerHeight - MARGIN * 2);
    return {
      width: Math.min(saved.width, maxWidth),
      height: Math.min(saved.height, maxHeight)
    };
  }

  function defaultPanelPosition(size) {
    const button = site.buttonPosition || defaultButtonPosition();
    const x = button.x > innerWidth / 2 ? button.x + FAB_SIZE - size.width : button.x;
    return clampPosition({ x, y: button.y }, size.width, size.height, innerWidth, innerHeight, MARGIN);
  }

  function frameRect() {
    if (!iframe) return { x: 0, y: 0, width: FAB_SIZE, height: FAB_SIZE };
    return {
      x: Number.parseFloat(iframe.style.left) || 0,
      y: Number.parseFloat(iframe.style.top) || 0,
      width: Number.parseFloat(iframe.style.width) || FAB_SIZE,
      height: Number.parseFloat(iframe.style.height) || FAB_SIZE
    };
  }

  function setFrameGeometry(position, width, height) {
    if (!iframe) return;
    const safe = clampPosition(position, width, height, innerWidth, innerHeight, MARGIN);
    iframe.style.left = `${safe.x}px`;
    iframe.style.top = `${safe.y}px`;
    iframe.style.width = `${Math.round(width)}px`;
    iframe.style.height = `${Math.round(height)}px`;
  }

  function setFrameShape(collapsed) {
    if (!iframe) return;
    iframe.style.borderRadius = collapsed ? '50%' : '0';
    iframe.style.overflow = collapsed ? 'hidden' : 'visible';
    iframe.style.clipPath = collapsed ? 'circle(50% at 50% 50%)' : 'none';
  }

  function applyCollapsedGeometry() {
    setFrameShape(true);
    setFrameGeometry(site.buttonPosition || defaultButtonPosition(), FAB_SIZE, FAB_SIZE);
  }

  function applyExpandedGeometry() {
    setFrameShape(false);
    const size = safePanelSize();
    setFrameGeometry(site.panelPosition || defaultPanelPosition(size), size.width, size.height);
  }

  async function persistSite(patch) {
    const result = await browser.runtime.sendMessage({ type: 'dn:host-site', patch });
    if (result) { site = sanitizeSiteRecord(result); sites[domain] = site; }
  }

  function createIframe() {
    if (iframe || !isVisible()) return;
    iframe = document.createElement('iframe');
    iframe.src = widgetUrl;
    iframe.title = 'Domain Notes';
    iframe.setAttribute('aria-label', 'Domain Notes');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    Object.assign(iframe.style, {
      position: 'fixed',
      zIndex: '2147483647',
      border: '0',
      padding: '0',
      margin: '0',
      background: 'transparent',
      colorScheme: 'normal',
      maxWidth: 'none',
      maxHeight: 'none'
    });
    (document.documentElement || document.body).appendChild(iframe);
    expanded = false;
    applyCollapsedGeometry();
  }

  function removeIframe() {
    if (!iframe) return;
    iframe.remove();
    iframe = null;
    expanded = false;
  }

  function reconcileVisibility() {
    if (isVisible()) createIframe();
    else removeIframe();
  }

  function postInit() {
    if (!iframe?.contentWindow || !sessionAuth || !widgetOrigin) return;
    iframe.contentWindow.postMessage({ type: 'dn:init', domain, auth: sessionAuth }, widgetOrigin);
  }

  function validDelta(value) {
    return Number.isFinite(value) && Math.abs(value) <= 2000;
  }

  function handleMove(message) {
    if (!validDelta(message.dx) || !validDelta(message.dy)) return;
    const rect = frameRect();
    const position = clampPosition({ x: rect.x + message.dx, y: rect.y + message.dy }, rect.width, rect.height, innerWidth, innerHeight, MARGIN);
    setFrameGeometry(position, rect.width, rect.height);
    if (message.commit === true) {
      persistSite(expanded ? { panelPosition: position } : { buttonPosition: position });
    }
  }

  function resizedRect(edge, dx, dy) {
    const rect = frameRect();
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    if (edge.includes('w')) left += dx;
    if (edge.includes('e')) right += dx;
    if (edge.includes('n')) top += dy;
    if (edge.includes('s')) bottom += dy;

    const maxW = Math.max(MIN_PANEL.width, innerWidth - MARGIN * 2);
    const maxH = Math.max(MIN_PANEL.height, innerHeight - MARGIN * 2);
    let width = right - left;
    let height = bottom - top;
    if (width < MIN_PANEL.width) edge.includes('w') ? left = right - MIN_PANEL.width : right = left + MIN_PANEL.width;
    if (width > maxW) edge.includes('w') ? left = right - maxW : right = left + maxW;
    if (height < MIN_PANEL.height) edge.includes('n') ? top = bottom - MIN_PANEL.height : bottom = top + MIN_PANEL.height;
    if (height > maxH) edge.includes('n') ? top = bottom - maxH : bottom = top + maxH;

    width = right - left;
    height = bottom - top;
    const safePosition = clampPosition({ x: left, y: top }, width, height, innerWidth, innerHeight, MARGIN);
    return { x: safePosition.x, y: safePosition.y, width, height };
  }

  function handleResize(message) {
    if (!expanded || !RESIZE_EDGES.has(message.edge) || !validDelta(message.dx) || !validDelta(message.dy)) return;
    const rect = resizedRect(message.edge, message.dx, message.dy);
    setFrameGeometry({ x: rect.x, y: rect.y }, rect.width, rect.height);
    if (message.commit === true) {
      persistSite({ panelPosition: { x: rect.x, y: rect.y }, panelSize: { width: rect.width, height: rect.height } });
    }
  }

  async function handleResetLayout() {
    await persistSite({ buttonPosition: null, panelPosition: null, panelSize: null });
    expanded ? applyExpandedGeometry() : applyCollapsedGeometry();
  }

  window.addEventListener('message', (event) => {
    if (!iframe || event.source !== iframe.contentWindow) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || !ALLOWED_MESSAGE_TYPES.has(message.type)) return;
    switch (message.type) {
      case 'dn:ready':
        postInit();
        break;
      case 'dn:expand':
        expanded = true;
        applyExpandedGeometry();
        break;
      case 'dn:collapse':
        expanded = false;
        applyCollapsedGeometry();
        break;
      case 'dn:move':
        handleMove(message);
        break;
      case 'dn:resize':
        handleResize(message);
        break;
      case 'dn:reset-layout':
        handleResetLayout();
        break;
    }
  });

  window.addEventListener('resize', () => {
    if (!iframe) return;
    expanded ? applyExpandedGeometry() : applyCollapsedGeometry();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) settings = sanitizeSettings(changes[SETTINGS_KEY].newValue);
    if (changes[SITES_KEY]) {
      sites = changes[SITES_KEY].newValue && typeof changes[SITES_KEY].newValue === 'object' && !Array.isArray(changes[SITES_KEY].newValue)
        ? changes[SITES_KEY].newValue : {};
      site = sanitizeSiteRecord(sites[domain]);
    }
    if (changes[SETTINGS_KEY] || changes[SITES_KEY]) {
      reconcileVisibility();
      if (iframe) expanded ? applyExpandedGeometry() : applyCollapsedGeometry();
    }
  });

  browser.runtime.onMessage.addListener(async message => {
    if (message?.type !== 'dn:refresh-access') return;
    await refreshAccess();
  });

  await loadHostState();
  await refreshAccess();
})();
