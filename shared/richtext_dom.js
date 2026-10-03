(function (root) {
  const rich = root.DomainNotesRichText || (typeof module !== 'undefined' ? require('./richtext.js') : null);
  const { sanitizeDocument, sanitizeRun, normalizeHexColor, sanitizeFont, sanitizeSize } = rich;
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  const TRAILING = /[.,!?;:)}\]]+$/;
  const FONT_CSS = Object.freeze({
    sans: 'sans-serif',
    serif: 'serif',
    monospace: 'monospace'
  });
  const HTML_SIZE_TO_PX = Object.freeze({ '1': 12, '2': 14, '3': 16, '4': 18, '5': 20, '6': 24, '7': 32 });

  function trimTrailing(url) {
    let clean = url;
    while (TRAILING.test(clean)) clean = clean.replace(TRAILING, '');
    return clean;
  }

  function appendText(parent, text, makeLinks) {
    const source = String(text || '');
    if (!makeLinks) { parent.append(document.createTextNode(source)); return; }
    let last = 0;
    for (const match of source.matchAll(URL_RE)) {
      const raw = match[0];
      const clean = trimTrailing(raw);
      const start = match.index;
      if (start > last) parent.append(document.createTextNode(source.slice(last, start)));
      try {
        const u = new URL(clean);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          const a = document.createElement('a');
          a.href = u.href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = clean;
          parent.append(a);
        } else {
          parent.append(document.createTextNode(clean));
        }
      } catch (_) {
        parent.append(document.createTextNode(clean));
      }
      if (raw.length > clean.length) parent.append(document.createTextNode(raw.slice(clean.length)));
      last = start + raw.length;
    }
    if (last < source.length) parent.append(document.createTextNode(source.slice(last)));
  }

  function fontIdFromCss(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase().replace(/["']/g, '').trim();
    if (!normalized) return null;
    if (normalized.includes('monospace')) return 'monospace';
    if (normalized.includes('sans-serif')) return 'sans';
    if (normalized === 'serif' || normalized.endsWith(', serif')) return 'serif';
    return null;
  }

  function sizeFromCss(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{1,2})px$/i);
    return match ? sanitizeSize(Number(match[1])) : null;
  }

  function runNode(run, makeLinks) {
    const safe = sanitizeRun(run);
    let leaf = document.createElement('span');
    if (safe.color) leaf.style.color = safe.color;
    if (safe.font) {
      leaf.dataset.dnFont = safe.font;
      leaf.style.fontFamily = FONT_CSS[safe.font];
    }
    if (safe.size) {
      leaf.dataset.dnSize = String(safe.size);
      leaf.style.fontSize = `${safe.size}px`;
    }
    appendText(leaf, safe.text, makeLinks);
    if (safe.strike) { const el = document.createElement('s'); el.append(leaf); leaf = el; }
    if (safe.underline) { const el = document.createElement('u'); el.append(leaf); leaf = el; }
    if (safe.italic) { const el = document.createElement('em'); el.append(leaf); leaf = el; }
    if (safe.bold) { const el = document.createElement('strong'); el.append(leaf); leaf = el; }
    return leaf;
  }

  function renderDocument(value, container, options = {}) {
    const doc = sanitizeDocument(value);
    container.replaceChildren();
    for (const block of doc.blocks) {
      if (block.type === 'ul') {
        const ul = document.createElement('ul');
        for (const item of block.items) {
          const li = document.createElement('li');
          for (const run of item) li.append(runNode(run, options.links === true));
          if (!item.length && options.editor) li.append(document.createElement('br'));
          ul.append(li);
        }
        container.append(ul);
      } else {
        const p = document.createElement(options.editor ? 'div' : 'p');
        for (const run of block.runs) p.append(runNode(run, options.links === true));
        if (!block.runs.length && options.editor) p.append(document.createElement('br'));
        container.append(p);
      }
    }
  }

  function cssColorToHex(value) {
    const direct = normalizeHexColor(value);
    if (direct) return direct;
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (!match) return null;
    const nums = match.slice(1, 4).map(Number);
    if (nums.some((n) => n < 0 || n > 255)) return null;
    return '#' + nums.map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  function nodeMarks(node, inherited) {
    const marks = { ...inherited };
    if (node.nodeType !== Node.ELEMENT_NODE) return marks;
    const tag = node.tagName.toLowerCase();
    if (tag === 'b' || tag === 'strong') marks.bold = true;
    if (tag === 'i' || tag === 'em') marks.italic = true;
    if (tag === 'u') marks.underline = true;
    if (tag === 's' || tag === 'strike') marks.strike = true;

    const style = node.style || {};
    if (style.fontWeight === 'bold' || Number.parseInt(style.fontWeight, 10) >= 600) marks.bold = true;
    if (style.fontStyle === 'italic') marks.italic = true;
    const deco = String(style.textDecoration || style.textDecorationLine || '');
    if (deco.includes('underline')) marks.underline = true;
    if (deco.includes('line-through')) marks.strike = true;

    const color = cssColorToHex(node.getAttribute?.('color') || style.color);
    if (color) marks.color = color;

    const dataFont = sanitizeFont(node.dataset?.dnFont);
    const cssFont = fontIdFromCss(node.getAttribute?.('face') || style.fontFamily);
    if (dataFont || cssFont) marks.font = dataFont || cssFont;

    const dataSize = sanitizeSize(Number(node.dataset?.dnSize));
    const cssSize = sizeFromCss(style.fontSize);
    const htmlSize = sanitizeSize(HTML_SIZE_TO_PX[node.getAttribute?.('size')]);
    if (dataSize || cssSize || htmlSize) marks.size = dataSize || cssSize || htmlSize;
    return marks;
  }

  function collectRuns(node, inherited, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) out.push({ text: node.nodeValue, ...inherited });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return;
    const marks = nodeMarks(node, inherited);
    for (const child of node.childNodes) collectRuns(child, marks, out);
  }

  function editorToDocument(editor) {
    const blocks = [];
    const base = { bold: false, italic: false, underline: false, strike: false, color: null, font: null, size: null };
    let looseRuns = [];
    const flushLoose = () => {
      if (looseRuns.length) { blocks.push({ type: 'p', runs: looseRuns }); looseRuns = []; }
    };

    for (const node of editor.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'ul') {
        flushLoose();
        const items = [];
        for (const li of node.children) {
          if (li.tagName.toLowerCase() !== 'li') continue;
          const runs = [];
          collectRuns(li, base, runs);
          items.push(runs);
        }
        blocks.push({ type: 'ul', items });
      } else if (node.nodeType === Node.ELEMENT_NODE && ['div', 'p'].includes(node.tagName.toLowerCase())) {
        flushLoose();
        const runs = [];
        collectRuns(node, base, runs);
        blocks.push({ type: 'p', runs });
      } else {
        collectRuns(node, base, looseRuns);
      }
    }
    flushLoose();
    return sanitizeDocument({ version: 1, blocks });
  }

  function renderEditor(value, editor) {
    renderDocument(value, editor, { editor: true, links: false });
  }

  function installPlainTextPaste(editor) {
    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain');
      if (typeof text !== 'string') return;
      editor.focus();
      document.execCommand('insertText', false, text);
    });
    editor.addEventListener('drop', (event) => {
      event.preventDefault();
      const text = event.dataTransfer?.getData('text/plain');
      if (typeof text !== 'string') return;
      editor.focus();
      document.execCommand('insertText', false, text);
    });
  }

  function nodeInsideEditor(editor, node) {
    return !!node && (node === editor || editor.contains(node));
  }

  function saveEditorSelection(editor) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount < 1) return null;
    const range = selection.getRangeAt(0);
    if (!nodeInsideEditor(editor, range.startContainer) || !nodeInsideEditor(editor, range.endContainer)) return null;
    return range.cloneRange();
  }

  function restoreEditorSelection(editor, token) {
    if (!token || !nodeInsideEditor(editor, token.startContainer) || !nodeInsideEditor(editor, token.endContainer)) return false;
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(token);
    return true;
  }

  function normalizeTemporarySizeNodes(editor, size) {
    for (const node of editor.querySelectorAll('font[size="7"]')) {
      const span = document.createElement('span');
      span.dataset.dnSize = String(size);
      span.style.fontSize = `${size}px`;
      while (node.firstChild) span.append(node.firstChild);
      node.replaceWith(span);
    }
  }

  function execFormat(editor, command, value = null, selectionToken = null) {
    const allowed = new Set(['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'removeFormat', 'foreColor', 'fontName', 'fontSizePx']);
    if (!allowed.has(command)) return false;
    if (selectionToken && !restoreEditorSelection(editor, selectionToken)) return false;
    else if (!selectionToken) editor.focus();

    if (command === 'foreColor') {
      const color = normalizeHexColor(value);
      return color ? document.execCommand('foreColor', false, color) : false;
    }
    if (command === 'fontName') {
      const font = sanitizeFont(value);
      return font ? document.execCommand('fontName', false, FONT_CSS[font]) : false;
    }
    if (command === 'fontSizePx') {
      const size = sanitizeSize(Number(value));
      if (!size) return false;
      const result = document.execCommand('fontSize', false, '7');
      normalizeTemporarySizeNodes(editor, size);
      return result;
    }
    return document.execCommand(command, false, value);
  }

  const api = {
    FONT_CSS,
    HTML_SIZE_TO_PX,
    renderDocument,
    renderEditor,
    editorToDocument,
    installPlainTextPaste,
    saveEditorSelection,
    restoreEditorSelection,
    execFormat,
    cssColorToHex,
    fontIdFromCss,
    sizeFromCss
  };
  root.DomainNotesRichTextDOM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
