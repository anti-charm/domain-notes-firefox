(function (root) {
  const MAX_NOTE_CHARS = 200000;
  const MAX_BLOCKS = 2000;
  const MAX_RUNS = 10000;
  const FONTS = Object.freeze(['sans', 'serif', 'monospace']);
  const SIZES = Object.freeze([12, 14, 16, 18, 20, 24, 28, 32]);
  const FONT_SET = new Set(FONTS);
  const SIZE_SET = new Set(SIZES);

  function normalizeHexColor(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(v) ? v : null;
  }

  function sanitizeFont(value) {
    return typeof value === 'string' && FONT_SET.has(value) ? value : null;
  }

  function sanitizeSize(value) {
    return typeof value === 'number' && Number.isInteger(value) && SIZE_SET.has(value) ? value : null;
  }

  function sanitizeRun(value, remaining) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let text = typeof raw.text === 'string' ? raw.text : '';
    if (Number.isFinite(remaining)) text = text.slice(0, Math.max(0, remaining));
    return {
      text,
      bold: raw.bold === true,
      italic: raw.italic === true,
      underline: raw.underline === true,
      strike: raw.strike === true,
      color: normalizeHexColor(raw.color),
      font: sanitizeFont(raw.font),
      size: sanitizeSize(raw.size)
    };
  }

  function sanitizeRuns(value, budget) {
    const input = Array.isArray(value) ? value : [];
    const out = [];
    let remaining = budget;
    for (const raw of input.slice(0, MAX_RUNS)) {
      if (remaining <= 0) break;
      const run = sanitizeRun(raw, remaining);
      if (run.text.length || input.length === 1) out.push(run);
      remaining -= run.text.length;
    }
    return { runs: out, used: budget - remaining };
  }

  function sanitizeDocument(value) {
    const rawBlocks = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.blocks)
      ? value.blocks
      : [];
    const blocks = [];
    let remaining = MAX_NOTE_CHARS;

    for (const rawBlock of rawBlocks.slice(0, MAX_BLOCKS)) {
      if (remaining <= 0) break;
      const block = rawBlock && typeof rawBlock === 'object' && !Array.isArray(rawBlock) ? rawBlock : {};
      if (block.type === 'ul') {
        const items = [];
        const rawItems = Array.isArray(block.items) ? block.items : [];
        for (const rawItem of rawItems.slice(0, MAX_RUNS)) {
          if (remaining <= 0) break;
          const itemRuns = Array.isArray(rawItem) ? rawItem : rawItem && Array.isArray(rawItem.runs) ? rawItem.runs : [];
          const result = sanitizeRuns(itemRuns, remaining);
          remaining -= result.used;
          items.push(result.runs);
        }
        blocks.push({ type: 'ul', items });
      } else {
        const result = sanitizeRuns(block.runs, remaining);
        remaining -= result.used;
        blocks.push({ type: 'p', runs: result.runs });
      }
    }

    if (!blocks.length) blocks.push({ type: 'p', runs: [] });
    return { version: 1, blocks };
  }

  function plainTextToDocument(text) {
    const source = String(text ?? '').slice(0, MAX_NOTE_CHARS);
    const blocks = source.split(/\r?\n/).slice(0, MAX_BLOCKS).map((line) => ({
      type: 'p',
      runs: line ? [{ text: line, bold: false, italic: false, underline: false, strike: false, color: null, font: null, size: null }] : []
    }));
    return sanitizeDocument({ version: 1, blocks: blocks.length ? blocks : [{ type: 'p', runs: [] }] });
  }

  function runsToText(runs) {
    return (Array.isArray(runs) ? runs : []).map((run) => typeof run?.text === 'string' ? run.text : '').join('');
  }

  function documentToPlainText(value) {
    const doc = sanitizeDocument(value);
    const lines = [];
    for (const block of doc.blocks) {
      if (block.type === 'ul') {
        for (const item of block.items) lines.push(runsToText(item));
      } else {
        lines.push(runsToText(block.runs));
      }
    }
    return lines.join('\n');
  }

  function hasMeaningfulContent(value) {
    return documentToPlainText(value).trim().length > 0;
  }

  const api = {
    MAX_NOTE_CHARS,
    FONTS,
    SIZES,
    normalizeHexColor,
    sanitizeFont,
    sanitizeSize,
    sanitizeRun,
    sanitizeDocument,
    plainTextToDocument,
    documentToPlainText,
    hasMeaningfulContent
  };
  root.DomainNotesRichText = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
