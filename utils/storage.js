/**
 * Prism — Chrome storage wrapper with opt-in encryption for secrets.
 *
 * Design notes:
 * - `coach:settings`          → settings object (plain JSON)
 * - `coach:history`           → array of coached-prompt records (plain)
 * - `coach:customTemplates`   → user-created templates (plain)
 * - `coach:favorites`         → array of favorite prompt texts (plain)
 * - `coach:learning`          → adaptive-learning profile (plain)
 * - `coach:secrets`           → { apiKey: <base64 blob>, iv: <base64> } (encrypted)
 *
 * The API key is the only secret the extension stores. It is encrypted at rest
 * with AES-GCM using a key derived via PBKDF2 from a device-local random salt
 * stored in chrome.storage.local. This is obfuscation-grade protection against
 * casual disk snooping, not a security boundary against malware running with
 * user privileges — the extension itself must be able to decrypt the key to use it.
 * Users who want stronger guarantees can leave the key blank and use the
 * rule-based offline coach, or point at a local Ollama instance.
 */
(function (root) {
  'use strict';

  const KEYS = {
    settings: 'coach:settings',
    history: 'coach:history',
    customTemplates: 'coach:customTemplates',
    favorites: 'coach:favorites',
    learning: 'coach:learning',
    secrets: 'coach:secrets',
    cryptoSalt: 'coach:cryptoSalt',
    apiCache: 'coach:apiCache'
  };

  const DEFAULT_SETTINGS = {
    version: 1,
    provider: 'offline',
    privacy: { allowCloudAi: false },
    offlineMode: true,
    models: {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-sonnet-4-20250514',
      gemini: 'gemini-1.5-flash',
      openrouter: 'openai/gpt-4o-mini',
      ollama: 'llama3.1'
    },
    apiKeys: { openai: '', anthropic: '', gemini: '', openrouter: '' },
    ollamaUrl: 'http://localhost:11434',
    appearance: { theme: 'dark', accent: 'violet', fontSize: 'medium', panelPosition: 'auto' },
    behavior: {
      showButtonOnSites: true,
      autoAnalyzeOnFocus: false,
      toastDuration: 2600,
      historyLimit: 200,
      historyDays: 60,
      cacheTtlMinutes: 30
    },
    learning: { enabled: true, tonePreference: 'auto', favoriteActions: {} }
  };

  const hasChrome = typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local;
  const area = hasChrome ? chrome.storage.local : null;

  // ---------------------------------------------------------------- utils

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(patch)) {
      const bv = base ? base[k] : undefined;
      const pv = patch[k];
      if (isPlainObject(bv) && isPlainObject(pv)) out[k] = deepMerge(bv, pv);
      else if (pv !== undefined) out[k] = pv;
    }
    return out;
  }
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ------------------------------------------------------------ raw layer

  async function rawGet(key, fallback) {
    if (!area) return fallback;
    return new Promise((resolve) => {
      try {
        area.get(key, (res) => {
          if (chrome.runtime.lastError) return resolve(fallback);
          const v = res && res[key];
          resolve(v === undefined ? fallback : v);
        });
      } catch (_) {
        resolve(fallback);
      }
    });
  }
  async function rawSet(key, value) {
    if (!area) return;
    return new Promise((resolve) => {
      try {
        area.set({ [key]: value }, () => resolve(!chrome.runtime.lastError));
      } catch (_) {
        resolve(false);
      }
    });
  }

  // ------------------------------------------------------------- crypto

  let cachedKey = null;

  async function getCryptoKey() {
    if (cachedKey) return cachedKey;
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    let saltB64 = await rawGet(KEYS.cryptoSalt, null);
    if (!saltB64) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      saltB64 = toB64(salt);
      await rawSet(KEYS.cryptoSalt, saltB64);
    }
    const salt = fromB64(saltB64);
    const base = await crypto.subtle.importKey('raw', enc.encode('prism:v1'), 'PBKDF2', false, ['deriveKey']);
    cachedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return cachedKey;
  }

  async function encryptString(plain) {
    const key = await getCryptoKey();
    if (!key) return null; // WebCrypto unavailable — caller falls back to plain storage.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    return { iv: toB64(iv), data: toB64(new Uint8Array(buf)) };
  }
  async function decryptString(blob) {
    const key = await getCryptoKey();
    if (!key) return null;
    const iv = fromB64(blob.iv);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromB64(blob.data));
    return dec.decode(buf);
  }

  // ------------------------------------------------------------- public

  async function getSettings() {
    const stored = await rawGet(KEYS.settings, null);
    if (!stored) return deepMerge(DEFAULT_SETTINGS, {});
    return deepMerge(DEFAULT_SETTINGS, stored);
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = deepMerge(current, patch || {});
    next.version = DEFAULT_SETTINGS.version;
    await rawSet(KEYS.settings, next);
    return next;
  }

  async function resetSettings() {
    await rawSet(KEYS.settings, deepMerge(DEFAULT_SETTINGS, {}));
    return getSettings();
  }

  // API keys: stored encrypted; readable only inside the extension.
  async function setApiKey(provider, key) {
    const secrets = (await rawGet(KEYS.secrets, {})) || {};
    if (!key) {
      delete secrets[provider];
      await rawSet(KEYS.secrets, secrets);
      return true;
    }
    const blob = await encryptString(key);
    if (blob) secrets[provider] = blob;
    else secrets[provider] = { plain: key }; // graceful fallback when WebCrypto is missing
    await rawSet(KEYS.secrets, secrets);
    return true;
  }

  async function getApiKey(provider) {
    const secrets = (await rawGet(KEYS.secrets, {})) || {};
    const entry = secrets[provider];
    if (!entry) return '';
    try {
      if (entry.data && entry.iv) return (await decryptString(entry)) || '';
      return entry.plain || '';
    } catch (_) {
      return '';
    }
  }

  async function hasAnyApiKey() {
    for (const p of ['openai', 'anthropic', 'gemini', 'openrouter']) {
      if (await getApiKey(p)) return true;
    }
    return false;
  }

  async function wipeSecrets() {
    await rawSet(KEYS.secrets, {});
  }

  // ------------------------------------------------------------ history

  async function getHistory() {
    const h = await rawGet(KEYS.history, []);
    return Array.isArray(h) ? h : [];
  }

  async function addHistoryEntry(entry) {
    const settings = await getSettings();
    const limit = (settings.behavior && settings.behavior.historyLimit) || 200;
    const days = (settings.behavior && settings.behavior.historyDays) || 60;
    const cutoff = Date.now() - days * 86400000;

    let h = await getHistory();
    h = h.filter((e) => e && e.ts && e.ts >= cutoff);
    h.unshift({
      id: entry.id || 'h' + Date.now() + Math.random().toString(36).slice(2, 7),
      ts: entry.ts || Date.now(),
      original: String(entry.original || ''),
      optimized: String(entry.optimized || ''),
      site: entry.site || '',
      goal: entry.goal || '',
      mode: entry.mode || 'offline',
      provider: entry.provider || 'offline',
      score: typeof entry.score === 'number' ? entry.score : null,
      favorite: !!entry.favorite
    });
    // De-duplicate identical coachings in a row.
    h = h.filter((e, i) => i === 0 || !h[i - 1] || e.original !== h[i - 1].original || e.optimized !== h[i - 1].optimized);
    h = h.slice(0, limit);
    await rawSet(KEYS.history, h);
    return h;
  }

  async function clearHistory() {
    await rawSet(KEYS.history, []);
  }

  async function toggleFavorite(id) {
    const h = await getHistory();
    let favState = false;
    for (const e of h) {
      if (e.id === id) {
        e.favorite = !e.favorite;
        favState = e.favorite;
      }
    }
    await rawSet(KEYS.history, h);
    return favState;
  }

  async function getFavorites() {
    const h = await getHistory();
    return h.filter((e) => e.favorite);
  }

  // --------------------------------------------------- custom templates

  async function getCustomTemplates() {
    const t = await rawGet(KEYS.customTemplates, []);
    return Array.isArray(t) ? t : [];
  }

  async function saveCustomTemplate(tpl) {
    const list = await getCustomTemplates();
    const id = tpl.id || 'c' + Date.now();
    const existing = list.findIndex((t) => t.id === id);
    const record = {
      id,
      name: tpl.name || 'Untitled',
      category: tpl.category || 'Custom',
      description: tpl.description || '',
      icon: tpl.icon || '⭐',
      template: tpl.template || '',
      custom: true
    };
    if (existing >= 0) list[existing] = record;
    else list.unshift(record);
    await rawSet(KEYS.customTemplates, list);
    return record;
  }

  async function deleteCustomTemplate(id) {
    const list = await getCustomTemplates();
    await rawSet(KEYS.customTemplates, list.filter((t) => t.id !== id));
  }

  // -------------------------------------------------- learning profile

  async function getLearningProfile() {
    const p = await rawGet(KEYS.learning, { goals: {}, actions: {}, sessions: 0 });
    return p && typeof p === 'object' ? p : { goals: {}, actions: {}, sessions: 0 };
  }

  async function recordLearning(event) {
    const p = await getLearningProfile();
    p.sessions = (p.sessions || 0) + 1;
    if (event.goal) p.goals[event.goal] = (p.goals[event.goal] || 0) + 1;
    if (event.action) p.actions[event.action] = (p.actions[event.action] || 0) + 1;
    await rawSet(KEYS.learning, p);
    return p;
  }

  // ------------------------------------------------------------ export

  async function exportAll() {
    return {
      kind: 'prism-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: await getSettings(),
      history: await getHistory(),
      customTemplates: await getCustomTemplates()
    };
  }

  async function importAll(data, { replace = false } = {}) {
    if (!data || data.kind !== 'prism-backup') {
      throw new Error('Not a Prism backup file.');
    }
    if (replace) {
      await rawSet(KEYS.settings, {});
      await rawSet(KEYS.history, []);
      await rawSet(KEYS.customTemplates, []);
      await wipeSecrets();
    }
    if (data.settings) await saveSettings(data.settings);
    if (Array.isArray(data.history)) {
      const existing = replace ? [] : await getHistory();
      const merged = [...data.history, ...existing];
      const seen = new Set();
      const deduped = merged.filter((e) => {
        const k = (e.original || '') + '|' + (e.optimized || '') + '|' + (e.ts || 0);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await rawSet(KEYS.history, deduped);
    }
    if (Array.isArray(data.customTemplates)) {
      const existing = replace ? [] : await getCustomTemplates();
      const byId = new Map(existing.map((t) => [t.id, t]));
      for (const t of data.customTemplates) if (t && t.id) byId.set(t.id, t);
      await rawSet(KEYS.customTemplates, [...byId.values()]);
    }
    return getSettings();
  }

  const CoachStorage = {
    KEYS,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    resetSettings,
    setApiKey,
    getApiKey,
    hasAnyApiKey,
    wipeSecrets,
    getHistory,
    addHistoryEntry,
    clearHistory,
    toggleFavorite,
    getFavorites,
    getCustomTemplates,
    saveCustomTemplate,
    deleteCustomTemplate,
    getLearningProfile,
    recordLearning,
    exportAll,
    importAll
  };

  root.CoachStorage = CoachStorage;
  if (typeof self !== 'undefined' && self !== root) self.CoachStorage = CoachStorage;
})(typeof globalThis !== 'undefined' ? globalThis : self);
