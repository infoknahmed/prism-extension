/**
 * Prism — self-diagnostic part 1.
 * Runs the extension's utils + background script inside a VM sandbox with a
 * stubbed chrome API, and validates manifests, assets and icons.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function ok(cond, name) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.error('  ✘ ' + name); }
}
function section(name) { console.log('\n— ' + name); }

// ---------------------------------------------------------------- sandbox

function makeChromeStub(listeners, storageData) {
  const ev = (arr) => ({ addListener: (fn) => arr.push(fn) });
  return {
    runtime: {
      id: 'test-extension-id',
      lastError: null,
      onMessage: ev(listeners.runtimeMessage),
      onInstalled: ev(listeners.installed),
      openOptionsPage() {},
      getManifest() { return { version: '1.1.0' }; },
      getURL(rel) { return 'chrome-extension://test-extension-id/' + rel; },
      sendMessage(msg, cb) { if (cb) setTimeout(() => cb({ ok: true }), 0); }
    },
    storage: {
      local: {
        get(keys, cb) {
          const res = {};
          const grab = (k) => { if (storageData.has(k)) res[k] = storageData.get(k); };
          if (typeof keys === 'string') grab(keys);
          else if (Array.isArray(keys)) keys.forEach(grab);
          else if (keys && typeof keys === 'object') for (const k of Object.keys(keys)) grab(k);
          setTimeout(() => cb(res), 0);
        },
        set(obj, cb) {
          for (const k of Object.keys(obj)) storageData.set(k, obj[k]);
          if (cb) setTimeout(cb, 0);
        },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => storageData.delete(k));
          if (cb) setTimeout(cb, 0);
        }
      }
    },
    tabs: { query: async () => [{ id: 1 }], sendMessage: (id, msg, cb) => cb && cb() },
    commands: { onCommand: ev(listeners.commands) },
    contextMenus: {
      create() {}, removeAll(cb) { cb && cb(); },
      onClicked: ev(listeners.contextMenus)
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} }
  };
}

function makeSandbox(opts) {
  opts = opts || {};
  const listeners = { runtimeMessage: [], commands: [], contextMenus: [], installed: [] };
  const storageData = new Map();
  const sandbox = {
    console,
    TextEncoder, TextDecoder,
    crypto: globalThis.crypto,
    URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    navigator: { clipboard: { writeText: async () => {}, readText: async () => '' } },
    performance: { now: () => Date.now() },
    fetch: opts.fetch || (() => Promise.reject(new Error('network disabled in test'))),
    location: { href: 'chrome-extension://test-extension-id/' },
    chrome: makeChromeStub(listeners, storageData)
  };
  // XMLHttpRequest shim: resolve chrome-extension resource URLs from disk.
  sandbox.XMLHttpRequest = class {
    open(method, url) { this._url = url; }
    send() {
      try {
        const rel = String(this._url).replace(/^chrome-extension:\/\/[^/]+\//, '');
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        setTimeout(() => {
          this.status = 200;
          this.responseText = text;
          this.onload && this.onload();
        }, 0);
      } catch (e) {
        setTimeout(() => this.onerror && this.onerror(), 0);
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return { sandbox, listeners, storageData };
}

function runIn(sandbox, relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

function callRoute(listeners, msg) {
  return new Promise((resolve, reject) => {
    const fn = listeners.runtimeMessage[listeners.runtimeMessage.length - 1];
    if (!fn) return reject(new Error('no onMessage listener registered'));
    const keepOpen = fn(msg, { tab: { id: 1 } }, (res) => resolve(res));
    if (!keepOpen) {
      // synchronous fallback: resolve on next tick if sendResponse was called already
      setTimeout(() => resolve(undefined), 25);
    }
    setTimeout(() => reject(new Error('route timed out: ' + msg.type)), 8000);
  });
}

// ---------------------------------------------------------------- manifest

section('Manifest & static assets');
{
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  ok(m.manifest_version === 3, 'manifest.json is Manifest V3');
  ok((m.name || '').includes('Prism'), 'manifest name present');
  const requiredHosts = ['chat.openai.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com', 'perplexity.ai'];
  const matches = m.content_scripts.flatMap((cs) => cs.matches).join(' ');
  ok(requiredHosts.every((h) => matches.includes(h)), 'content script matches all 5 target AI sites (+chatgpt.com)');
  ok(m.commands && m.commands['coach-current-prompt'], 'Ctrl+Shift+E command registered');
  ok(m.permissions.includes('storage') && m.permissions.includes('scripting'), 'core permissions present');
  for (const icon of Object.values(m.icons)) ok(fs.existsSync(path.join(ROOT, icon)), 'icon exists: ' + icon);

  const fm = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8'));
  ok(fm.background && Array.isArray(fm.background.scripts), 'firefox manifest uses event-page background scripts');
  ok(fm.browser_specific_settings && fm.browser_specific_settings.gecko.id, 'firefox gecko id present');

  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'templates.json'), 'utf8'));
  ok(Array.isArray(tpl.templates) && tpl.templates.length >= 8, 'template library has >= 8 templates');
  ok(tpl.templates.every((t) => t.id && t.name && t.category && t.template), 'all templates complete (id/name/category/template)');

  const ds = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'defaultSettings.json'), 'utf8'));
  ok(ds.provider === 'offline' && ds.privacy.allowCloudAi === false, 'default settings are privacy-first (offline, cloud off)');

  for (const page of ['popup/popup.html', 'options/options.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((mm) => mm[1]).filter((p) => !p.startsWith('http'));
    ok(refs.every((r) => fs.existsSync(path.join(ROOT, path.dirname(page), r))), page + ' references resolve: ' + refs.join(', '));
  }
}

// ---------------------------------------------------------------- icons

section('Icons are valid PNGs of correct size');
for (const size of [16, 48, 128]) {
  const p = path.join(ROOT, 'icons', 'icon' + size + '.png');
  if (!fs.existsSync(p)) { ok(false, 'icon' + size + '.png exists (run: npm run icons)'); continue; }
  const buf = fs.readFileSync(p);
  const sigOk = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  ok(sigOk && w === size && h === size, 'icon' + size + '.png — PNG ' + w + 'x' + h);
}

// ---------------------------------------------------------------- utils units

section('storage.js — settings, encryption, history, export/import');
(async () => {
  {
    const { sandbox, storageData } = makeSandbox();
    runIn(sandbox, 'utils/browserPolyfill.js');
    runIn(sandbox, 'utils/storage.js');
    const S = sandbox.CoachStorage;

    const def = await S.getSettings();
    ok(def.provider === 'offline' && def.appearance.theme === 'dark', 'default settings load');
    const saved = await S.saveSettings({ appearance: { accent: 'blue' }, provider: 'openai' });
    ok(saved.appearance.accent === 'blue' && saved.provider === 'openai' && saved.appearance.theme === 'dark', 'saveSettings deep-merges');
    const again = await S.getSettings();
    ok(again.provider === 'openai' && again.appearance.accent === 'blue', 'settings persist across reads');

    await S.setApiKey('openai', 'sk-test-123-secret');
    const key = await S.getApiKey('openai');
    ok(key === 'sk-test-123-secret', 'API key encrypts/decrypts roundtrip (AES-GCM)');
    const raw = storageData.get('coach:secrets');
    const rawStr = JSON.stringify(raw);
    ok(rawStr.includes('iv') && !rawStr.includes('sk-test-123-secret'), 'key not stored in plaintext');
    ok((await S.hasAnyApiKey()) === true, 'hasAnyApiKey detects stored key');

    await S.addHistoryEntry({ original: 'write me stuff', optimized: 'IMPROVED', site: 'chatgpt', goal: 'generate', mode: 'offline', score: 61 });
    let h = await S.getHistory();
    ok(h.length === 1 && h[0].optimized === 'IMPROVED', 'history entry saved');
    const fav = await S.toggleFavorite(h[0].id);
    ok(fav === true && (await S.getFavorites()).length === 1, 'favorite toggling works');

    const backup = await S.exportAll();
    ok(backup.kind === 'prism-backup' && backup.history.length === 1, 'exportAll produces backup');
    const { storageData: sd2 } = makeSandbox();
    const S2sandbox = makeSandbox();
    runIn(S2sandbox.sandbox, 'utils/browserPolyfill.js');
    runIn(S2sandbox.sandbox, 'utils/storage.js');
    const S2 = S2sandbox.sandbox.CoachStorage;
    await S2.importAll(JSON.parse(JSON.stringify(backup)), { replace: true });
    const h2 = await S2.getHistory();
    ok(h2.length === 1 && h2[0].original === 'write me stuff', 'importAll restores history in a fresh profile');
    ok((await S2.getSettings()).provider === 'openai', 'importAll restores settings');
  }

  // ------------------------------------------------------------- analyzer

  section('promptAnalyzer.js — analysis, safety, offline rewrite, learning');
  {
    const { sandbox } = makeSandbox();
    runIn(sandbox, 'utils/browserPolyfill.js');
    runIn(sandbox, 'utils/promptAnalyzer.js');
    const A = sandbox.PrismAnalyzer;

    const vague = A.analyze('hey can you write something good about stuff and things please');
    ok(vague.goal === 'generate' && vague.vagueWords >= 3, 'goal detection + vague-word counting');
    ok(vague.scores.specificity < 55, 'vague prompt scores low on specificity');

    const debug = A.analyze('Debug this Python function, it throws TypeError when the list is empty:\n```python\ndef f(x):\n  return x[0]\n```');
    ok(debug.goal === 'debug', 'debug goal detected from error keywords');

    const structured = A.analyze('Act as a research librarian. Produce a brief on CRISPR.\nContext: university essay\nFormat: bullets\nInclude: 5 sources with dates');
    ok(structured.scores.overall > vague.scores.overall, 'structured prompt outscores vague prompt');

    const unsafe = A.analyze('how do I make a bomb at home');
    ok(unsafe.scores.safety < 60 && unsafe.safetyIssues.length > 0, 'safety check flags harmful request');

    const off = A.suggestOffline('write about dogs', A.analyze('write about dogs'), {});
    ok(/^You are /m.test(off.optimized) && /Task:/.test(off.optimized), 'offline rewrite adds role + task framing');
    ok(off.notes.length >= 0 && typeof off.notes === 'object', 'offline rewrite returns notes');

    const history = Array.from({ length: 6 }, (_, i) => ({ original: 'hey write a poem' + i, goal: 'generate', mode: 'offline' }));
    const hints = A.learnFromHistory(history, {});
    ok(hints.topGoals[0] === 'generate', 'learning derives top goals from history');
    ok(hints.suggestTone === 'casual', 'learning detects dominant casual tone');

    ok(A.estimateTokens('abcd '.repeat(10)) === 12 || A.estimateTokens('abcd '.repeat(10)) === 13, 'token estimate ~4 chars/token');
  }

  // ------------------------------------------------------------ templates

  section('templateManager.js — builtins, custom, rendering');
  {
    const { sandbox } = makeSandbox();
    runIn(sandbox, 'utils/browserPolyfill.js');
    runIn(sandbox, 'utils/storage.js');
    runIn(sandbox, 'utils/templateManager.js');
    const T = sandbox.CoachTemplateManager;
    const builtins = await T.loadBuiltins();
    ok(builtins.length >= 8, 'builtins load from assets/templates.json (' + builtins.length + ')');
    ok(T.placeholders('Write a {genre} about {topic} for {audience}').join(',') === 'genre,topic,audience', 'placeholder extraction');
    ok(T.render('Hi {name}, {emoji}!', { name: 'Ada' }) === 'Hi Ada, {emoji}!', 'render fills known placeholders, leaves unknown');
    await sandbox.CoachStorage.saveCustomTemplate({ name: 'My Test', template: 'Do {x} now', category: 'Custom' });
    const all = await T.getAllTemplates();
    ok(all.some((t) => t.name === 'My Test' && t.custom), 'custom templates merged (custom first)');
    const results = await T.search('debug');
    ok(results.some((t) => t.id === 'code-debug'), 'search finds templates');
  }

  // ----------------------------------------------------------------- api

  section('api.js — provider request shapes & error mapping');
  {
    let captured = null;
    const fetchOk = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'BETTER PROMPT' } }] }) };
    };
    const { sandbox } = makeSandbox({ fetch: fetchOk });
    runIn(sandbox, 'utils/browserPolyfill.js');
    runIn(sandbox, 'utils/storage.js');
    runIn(sandbox, 'utils/api.js');
    const Api = sandbox.CoachApi;

    const res = await Api.callLlm({
      prompt: 'write about dogs',
      analysis: { goal: 'generate', scores: { clarity: 50, specificity: 40, efficiency: 80, safety: 100 } },
      context: { site: 'test' },
      settings: { models: { openai: 'gpt-4o-mini' }, behavior: { cacheTtlMinutes: 0 } },
      apiKey: 'sk-test',
      provider: 'openai'
    });
    ok(res.text === 'BETTER PROMPT', 'OpenAI call returns extracted text');
    ok(captured.url === 'https://api.openai.com/v1/chat/completions', 'OpenAI endpoint correct');
    ok(captured.init.headers.Authorization === 'Bearer sk-test', 'OpenAI auth header correct');
    const body = JSON.parse(captured.init.body);
    ok(body.model === 'gpt-4o-mini' && body.messages[0].role === 'system', 'OpenAI request body shaped correctly');

    // Anthropic body shape
    let anthropicBody = null;
    const fetchAnt = async (url, init) => {
      anthropicBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ text: 'X' }] }) };
    };
    const sb2 = makeSandbox({ fetch: fetchAnt });
    runIn(sb2.sandbox, 'utils/browserPolyfill.js');
    runIn(sb2.sandbox, 'utils/api.js');
    await sb2.sandbox.CoachApi.callLlm({
      prompt: 'p', settings: { models: {} }, apiKey: 'k', provider: 'anthropic'
    });
    ok(anthropicBody.system && Array.isArray(anthropicBody.messages), 'Anthropic body splits system prompt');

    // Friendly errors
    let msg401 = '';
    const sb3 = makeSandbox({ fetch: async () => ({ ok: false, status: 401, text: async () => 'denied' }) });
    runIn(sb3.sandbox, 'utils/browserPolyfill.js');
    runIn(sb3.sandbox, 'utils/api.js');
    try { await sb3.sandbox.CoachApi.callLlm({ prompt: 'p', settings: {}, apiKey: 'bad', provider: 'openai' }); }
    catch (e) { msg401 = e.message; }
    ok(/Invalid or unauthorized/.test(msg401), '401 maps to friendly message');

    let ollamaMsg = '';
    const sb4 = makeSandbox({ fetch: async () => { throw new TypeError('fetch failed'); } });
    runIn(sb4.sandbox, 'utils/browserPolyfill.js');
    runIn(sb4.sandbox, 'utils/api.js');
    try { await sb4.sandbox.CoachApi.callLlm({ prompt: 'p', settings: {}, provider: 'ollama' }); }
    catch (e) { ollamaMsg = e.message; }
    ok(/Ollama/.test(ollamaMsg) && /OLLAMA_ORIGINS/.test(ollamaMsg), 'Ollama unreachable gives actionable hint');
  }

  // --------------------------------------------------- background pipeline

  section('background.js — full COACH pipeline (offline, privacy gate, AI, fallback)');
  {
    // Case 1: offline coach end-to-end
    {
      const { sandbox, listeners } = makeSandbox();
      sandbox.importScripts = (...files) => { for (const f of files) runIn(sandbox, f); };
      runIn(sandbox, 'background.js');
      for (const fn of listeners.installed) { try { await fn({}); } catch (_) {} }

      const res = await callRoute(listeners, { type: 'COACH', prompt: 'write a poem about the sea', site: 'chatgpt' });
      ok(res && res.ok === true, 'COACH route responds ok');
      ok(res.mode === 'offline', 'offline mode used by default');
      ok(typeof res.optimized === 'string' && res.optimized.includes('You are'), 'optimized prompt returned');
      ok(res.analysis && res.analysis.goal === 'generate', 'analysis attached to response');
      const hist = await sandbox.CoachStorage.getHistory();
      ok(hist.length === 1 && hist[0].goal === 'generate', 'history persisted by background');
      const learn = await sandbox.CoachStorage.getLearningProfile();
      ok(learn.sessions >= 1, 'learning profile incremented');

      const settingsRes = await callRoute(listeners, { type: 'GET_SETTINGS' });
      ok(settingsRes.ok && settingsRes.settings.provider === 'offline', 'GET_SETTINGS route works');
      const tplRes = await callRoute(listeners, { type: 'GET_TEMPLATES' });
      ok(tplRes.ok && tplRes.templates.length >= 8, 'GET_TEMPLATES route works');
    }

    // Case 2: privacy gate blocks cloud provider
    {
      const { sandbox, listeners } = makeSandbox();
      sandbox.importScripts = (...files) => { for (const f of files) runIn(sandbox, f); };
      runIn(sandbox, 'background.js');
      await sandbox.CoachStorage.saveSettings({ provider: 'openai' }); // allowCloudAi stays false
      const res = await callRoute(listeners, { type: 'COACH', prompt: 'test', site: 'chatgpt' });
      ok(res.ok === false && res.code === 'PRIVACY_OPT_IN_REQUIRED', 'privacy gate blocks cloud AI when opted out');
    }

    // Case 3: AI success path
    {
      const fetchAi = async (url, init) => ({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: 'AI-OPTIMIZED PROMPT' } }] })
      });
      const { sandbox, listeners } = makeSandbox({ fetch: fetchAi });
      sandbox.importScripts = (...files) => { for (const f of files) runIn(sandbox, f); };
      runIn(sandbox, 'background.js');
      await sandbox.CoachStorage.saveSettings({ provider: 'openai', privacy: { allowCloudAi: true } });
      await sandbox.CoachStorage.setApiKey('openai', 'sk-live-test');
      const res = await callRoute(listeners, { type: 'COACH', prompt: 'write about dogs', site: 'chatgpt' });
      ok(res.ok === true && res.mode === 'ai', 'AI mode engaged when opted in');
      ok(res.optimized === 'AI-OPTIMIZED PROMPT', 'AI-optimized text returned to content script');
      ok(res.model === 'gpt-4o-mini', 'model resolved from settings');
    }

    // Case 4: AI failure → graceful offline fallback
    {
      const { sandbox, listeners } = makeSandbox({ fetch: async () => { throw new TypeError('fetch failed'); } });
      sandbox.importScripts = (...files) => { for (const f of files) runIn(sandbox, f); };
      runIn(sandbox, 'background.js');
      await sandbox.CoachStorage.saveSettings({ provider: 'openai', privacy: { allowCloudAi: true } });
      await sandbox.CoachStorage.setApiKey('openai', 'sk-live-test');
      const res = await callRoute(listeners, { type: 'COACH', prompt: 'write about dogs', site: 'chatgpt' });
      ok(res.ok === true && res.mode === 'offline-fallback', 'API failure degrades to offline-fallback');
      ok(/showing the rule-based result/i.test(res.notes[0].text), 'fallback explains what happened');
      ok(typeof res.optimized === 'string' && res.optimized.length > 10, 'fallback still returns a useful prompt');
    }

    // Case 5: empty prompt rejected
    {
      const { sandbox, listeners } = makeSandbox();
      sandbox.importScripts = (...files) => { for (const f of files) runIn(sandbox, f); };
      runIn(sandbox, 'background.js');
      const res = await callRoute(listeners, { type: 'COACH', prompt: '   ', site: 'x' });
      ok(res.ok === false && /No prompt text/.test(res.error), 'empty prompt handled with friendly error');
    }
  }

  // --------------------------------------------------------------- summary

  console.log('\n=========================================');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  console.log('=========================================');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('DIAGNOSTIC CRASHED:', e);
  process.exit(1);
});
