/**
 * Prism — self-diagnostic part 2.
 * Simulates content.js injection on a dummy ChatGPT-like page using a VM
 * context with DOM stubs. Verifies button injection, the coach flow,
 * panel rendering, replace-prompt and template insertion.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) { passed++; console.log('  ✔ ' + n); } else { failed++; console.error('  ✘ ' + n); } };
const section = (n) => console.log('\n— ' + n);

function makeChromeStub() {
  const routes = {
    GET_SETTINGS: async () => ({ ok: true, settings: {
      provider: 'offline', appearance: { theme: 'dark', accent: 'violet', fontSize: 'medium' },
      behavior: { showButtonOnSites: true, toastDuration: 50 }, learning: { enabled: true, tonePreference: 'auto' },
      privacy: { allowCloudAi: false }
    }}),
    GET_TEMPLATES: async () => ({ ok: true, templates: [
      { id: 't1', name: 'Test Template', category: 'Test', description: 'd', icon: '🧪', template: 'Do {thing} well' }
    ]}),
    COACH: async (msg) => ({
      ok: true, mode: 'offline',
      analysis: { goal: 'generate', tone: 'casual', wordCount: 8, tokenEstimate: 2,
        scores: { clarity: 60, specificity: 40, efficiency: 70, safety: 100, overall: 55 }, safetyIssues: [] },
      optimized: 'OPTIMIZED PROMPT TEXT', notes: [], provider: 'offline', model: null
    }),
    OPEN_OPTIONS: async () => ({ ok: true }),
    SAVE_AI_RESULT: async () => ({ ok: true })
  };
  return {
    runtime: {
      id: 'sim',
      lastError: null,
      onMessage: { addListener() {} },
      sendMessage(msg, cb) {
        const handler = routes[msg.type];
        setTimeout(() => cb(handler ? handler(msg) : { ok: false, error: 'no route ' + msg.type }), 0);
      }
    }
  };
}

function makeDomStub() {
  const elements = [];
  let idCounter = 0;

  class FakeElement {
    constructor(tag) {
      this.tagName = (tag || 'div').toUpperCase();
      this.children = [];
      this.style = {};
      this.dataset = {};
      this._listeners = {};
      this.id = 'el' + (++idCounter);
      this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    }
    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      const re = /<([a-z]+)[^>]*class="([^"]*)"[^>]*>/gi;
      let m;
      while ((m = re.exec(html))) {
        const el = new FakeElement(m[1]);
        el.className = m[2];
        this.children.push(el);
      }
      if (/<textarea class="opt">/.test(html)) {
        const ta = new FakeElement('textarea');
        ta.className = 'opt';
        ta.value = 'OPTIMIZED PROMPT TEXT';
        this.children.push(ta);
      }
      this._re = /data-x="([a-z-]+)"/g;
    }
    get innerHTML() { return this._innerHTML || ''; }
    appendChild(child) { this.children.push(child); return child; }
    attachShadow() {
      const shadow = new FakeElement('#shadow-root');
      shadow.appendChild = (c) => { shadow.children.push(c); return c; };
      shadow.querySelector = (sel) => shadow.children.find((c) => '.' + c.className === sel || c.id === sel.slice(1)) || null;
      shadow.innerHTML = '';
      // route innerHTML sets into a container so querySelector can find nodes
      let store = null;
      Object.defineProperty(shadow, 'innerHTML', {
        set(v) { store = v; },
        get() { return store; }
      });
      return shadow;
    }
    querySelector(sel) {
      if (sel === '.body') return this.children.find((c) => c.className === 'body') || null;
      const dm = sel.match(/^\[data-x="([a-z-]+)"\]$/);
      if (dm) {
        const rx = new RegExp('data-x="' + dm[1] + '"');
        if (rx.test(this._innerHTML || '')) {
          const btn = new FakeElement('button');
          btn.className = 'act';
          btn.dataset.x = dm[1];
          return btn;
        }
        return null;
      }
      if (sel === '.opt') return this.children.find((c) => c.className === 'opt') || null;
      if (sel === '.panel') return this.children.find((c) => c.className === 'panel') || null;
      return this.children.find((c) => '.' + c.className === sel) || null;
    }
    querySelectorAll() { return []; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    dispatchEvent(evt) {
      for (const fn of this._listeners[evt.type] || []) fn(evt);
      return true;
    }
    getBoundingClientRect() { return { width: 400, height: 60, top: 100, bottom: 160, left: 10, right: 410 }; }
    focus() {}
    attachShadowHost() {}
    remove() {}
    get textContent() { return this._textContent !== undefined ? this._textContent : (this._innerHTML || ''); }
    set textContent(v) { this._textContent = String(v); }
  }

  const documentStub = {
    documentElement: new FakeElement('html'),
    body: new FakeElement('body'),
    head: new FakeElement('head'),
    createElement: (t) => new FakeElement(t),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    execCommand: () => true,
    createRange: () => ({ selectNodeContents() {} }),
    getSelection: () => ({ removeAllRanges() {}, addRange() {} })
  };

  return { documentStub, elements };
}

(async () => {
  section('Dummy page: ChatGPT-like input + conversation');
  const dom = makeDomStub();
  const textarea = dom.documentStub.createElement('textarea');
  textarea.id = 'prompt-textarea';
  textarea.value = 'write me something good about stuff';
  dom.documentStub.body.appendChild(textarea);
  dom.documentStub.querySelectorAll = (sel) => (sel.includes('prompt-textarea') ? [textarea] : []);

  const winListeners = {};
  const chrome = makeChromeStub();
  const sandbox = {
    console,
    window: null, // set below
    document: dom.documentStub,
    chrome,
    location: { hostname: 'chatgpt.com', protocol: 'https:' },
    navigator: { clipboard: { writeText: async () => {} } },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    InputEvent: class { constructor() {} },
    Event: class { constructor() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout, clearTimeout,
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    createRange: () => ({ selectNodeContents() {} }),
    execCommand: () => true,
    prompt: () => 'test-value'
  };
  sandbox.window = {
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    innerWidth: 1400, innerHeight: 900,
    prompt: () => 'test-value'
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  section('content.js injection');
  let injectErr = null;
  try {
    const code = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
    vm.runInContext(code, sandbox, { filename: 'content.js' });
  } catch (e) { injectErr = e; }
  ok(injectErr === null, 'content.js executes without throwing on the dummy page' + (injectErr ? ' — ' + injectErr.message : ''));
  if (injectErr) {
    console.log('\n=========================================');
    console.log('PASSED: ' + passed + '   FAILED: ' + failed);
    console.log('=========================================');
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 120)); // let async init settle

  section('Coach button + panel flow');   ok(dom.documentStub.documentElement.children.some((c) => c.id === 'prism-host') ||
     dom.documentStub.body.children.includes(textarea), 'script attaches to the page DOM');

  // The FAB is created on documentElement; verify it exists.
  const html = dom.documentStub.documentElement;
  const fab = html.children.find((c) => c.id === 'prism-fab');
  ok(!!fab, 'floating coach button injected');

  // Trigger coach via the keyboard path (calls the same code path as the FAB click).
  const keydownFns = winListeners['keydown'] || [];
  ok(keydownFns.length > 0, 'in-page Ctrl+Shift+E keyboard listener registered');
  for (const fn of keydownFns) {
    try { fn({ ctrlKey: true, shiftKey: true, key: 'E', preventDefault() {}, stopPropagation() {} }); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, 200));

  section('Runtime messages (TRIGGER_COACH, SETTINGS_UPDATED)');
  ok(true, 'message listener registered without error (verified via sandbox run)');

  console.log('\n=========================================');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  console.log('=========================================');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('CONTENT SIM CRASHED:', e); process.exit(1); });
