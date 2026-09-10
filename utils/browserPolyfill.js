/**
 * Prism — cross-browser API polyfill.
 * Exposes `chrome.*` everywhere. On Firefox, aliases the native `browser.*`
 * promise-based API onto `chrome` so the same code runs in both engines.
 */
(function () {
  'use strict';

  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime && globalThis.chrome.runtime.id) {
    return; // Chromium: real chrome namespace already present.
  }

  if (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime && globalThis.browser.runtime.id) {
    // Firefox: mirror `browser` (promise-based) onto `chrome`.
    const api = globalThis.browser;
    const chromeLike = { __isPolyfill: true };
    const seen = new Set();

    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

    const wrap = (fn) => function (...args) {
      // Some browser.* APIs are still callback-based (e.g. commands.getAll pre-FF106).
      const last = args.length ? args[args.length - 1] : undefined;
      if (typeof last === 'function') {
        return fn.apply(this, args);
      }
      return fn.apply(this, args); // returns a native Promise already
    };

    for (const nsName of Object.keys(api)) {
      try {
        const ns = api[nsName];
        if (!ns || typeof ns !== 'object') {
          chromeLike[nsName] = ns;
          continue;
        }
        const nsCopy = {};
        for (const key of Object.keys(ns)) {
          if (seen.has(nsName + '.' + key)) continue;
          seen.add(nsName + '.' + key);
          const val = ns[key];
          if (typeof val === 'function') {
            nsCopy[key] = wrap(val);
          } else if (val && typeof val === 'object' && !Array.isArray(val)) {
            // Event objects (addListener etc.) and enums: shallow-copy as-is.
            nsCopy[key] = val;
          } else {
            nsCopy[key] = val;
          }
        }
        chromeLike[nsName] = nsCopy;
      } catch (_) {
        /* ignore inaccessible namespaces */
      }
    }

    // Firefox's storage.get/set already resolve with the underlying data.
    globalThis.chrome = chromeLike;
    return;
  }

  // Not running in an extension context (e.g. plain web page during tests).
  globalThis.chrome = globalThis.chrome || undefined;
})();
