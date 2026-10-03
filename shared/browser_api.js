// Firefox exposes `browser`; Chromium exposes `chrome`. Keeping this tiny
// compatibility shim makes local testing possible without changing Firefox behavior.
if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}
