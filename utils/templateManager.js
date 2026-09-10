/**
 * Prism — template manager.
 * Merges built-in templates (assets/templates.json) with user templates
 * (chrome.storage) and renders {placeholders}.
 */
(function (root) {
  'use strict';

  // Built-ins are inlined at build time from assets/templates.json by
  // scripts/build.js; this fallback keeps the file working unbundled too.
  const FALLBACK_BUILTINS = [];
  let builtins = null;

  const CoachTemplateManager = {
    async loadBuiltins() {
      if (builtins) return builtins;
      const data = await this._fetchTemplatesJson();
      builtins = data && Array.isArray(data.templates) ? data.templates : FALLBACK_BUILTINS;
      return builtins;
    },

    /** fetch() first, XHR fallback (Firefox content scripts can't always fetch resource URLs). */
    _fetchTemplatesJson() {
      const url = root.chrome && root.chrome.runtime && root.chrome.runtime.getURL
        ? root.chrome.runtime.getURL('assets/templates.json')
        : 'assets/templates.json';
      return new Promise((resolve) => {
        const done = (v) => resolve(v || null);
        try {
          fetch(url)
            .then((res) => (res.ok ? res.json() : null))
            .then(done)
            .catch(() => this._xhrTemplatesJson(url).then(done).catch(() => done(null)));
        } catch (_) {
          this._xhrTemplatesJson(url).then(done).catch(() => done(null));
        }
      });
    },

    _xhrTemplatesJson(url) {
      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = () => {
            try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
          };
          xhr.onerror = () => reject(new Error('XHR failed for ' + url));
          xhr.send();
        } catch (e) { reject(e); }
      });
    },

    async getAllTemplates() {
      const [builtin, custom] = await Promise.all([
        this.loadBuiltins(),
        root.CoachStorage ? root.CoachStorage.getCustomTemplates() : Promise.resolve([])
      ]);
      return [...(custom || []), ...(builtin || [])]; // custom first
    },

    async getTemplate(id) {
      const all = await this.getAllTemplates();
      return all.find((t) => t.id === id) || null;
    },

    /** Fill {placeholders} — unknown placeholders are left as-is. */
    render(templateText, values) {
      let out = String(templateText || '');
      for (const [k, v] of Object.entries(values || {})) {
        const safe = String(v).replace(/\{/g, '〈').replace(/\}/g, '〉');
        out = out.split('{' + k + '}').join(safe);
      }
      return out;
    },

    /** Extract {placeholder} names from a template. */
    placeholders(templateText) {
      const found = String(templateText || '').match(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g) || [];
      return [...new Set(found.map((s) => s.slice(1, -1)))];
    },

    async search(query) {
      const all = await this.getAllTemplates();
      const q = String(query || '').toLowerCase().trim();
      if (!q) return all;
      return all.filter((t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    },

    invalidateBuiltinsCache() {
      builtins = null;
    }
  };

  root.CoachTemplateManager = CoachTemplateManager;
  if (typeof self !== 'undefined' && self !== root) self.CoachTemplateManager = CoachTemplateManager;
})(typeof globalThis !== 'undefined' ? globalThis : self);
