/**
 * Prism — content script.
 * Injects a floating coach button on supported AI chat sites, reads the
 * current prompt + conversation context, and renders a shadow-DOM coach
 * panel with analysis, optimized prompt, side-by-side comparison,
 * copy/replace actions and a template picker.
 */
(() => {
  'use strict';
  if (window.__prismInjected) return;
  window.__prismInjected = true;

  const HOSTS = {
    'chat.openai.com': 'chatgpt',
    'chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'chat.deepseek.com': 'deepseek',
    'www.perplexity.ai': 'perplexity',
    'perplexity.ai': 'perplexity'
  };
  const SITE = HOSTS[location.hostname] || 'generic';

  // ----------------------------------------------------- site adapters

  const ADAPTERS = {
    chatgpt: {
      input: ['#prompt-textarea', 'div[contenteditable="true"]#prompt-textarea', 'form div[contenteditable="true"]'],
      conversation: () => {
        const nodes = document.querySelectorAll('[data-message-author-role]');
        return [...nodes].slice(-8).map((n) => {
          const role = n.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant';
          return role + ': ' + (n.innerText || '').trim().slice(0, 400);
        }).join('\n\n');
      }
    },
    claude: {
      input: ['div[contenteditable="true"].ProseMirror', 'fieldset div[contenteditable="true"]', 'div[contenteditable="true"]'],
      conversation: () => {
        const users = [...document.querySelectorAll('[data-testid="user-message"]')].slice(-4)
          .map((n) => 'User: ' + (n.innerText || '').trim().slice(0, 400));
        const assistants = [...document.querySelectorAll('.font-claude-message, [data-is-streaming]')]
          .slice(-4).map((n) => 'Assistant: ' + (n.innerText || '').trim().slice(0, 400));
        return [...users, ...assistants].join('\n\n');
      }
    },
    gemini: {
      input: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]'],
      conversation: () => {
        const qs = [...document.querySelectorAll('user-query')].slice(-4)
          .map((n) => 'User: ' + (n.textContent || '').trim().slice(0, 400));
        const as = [...document.querySelectorAll('model-response, message-content')].slice(-4)
          .map((n) => 'Assistant: ' + (n.textContent || '').trim().slice(0, 400));
        return [...qs, ...as].join('\n\n');
      }
    },
    deepseek: {
      input: ['textarea#chat-input', 'textarea'],
      conversation: () => {
        const msgs = [...document.querySelectorAll('.ds-message, .markdown-body')].slice(-8)
          .map((n) => (n.innerText || '').trim().slice(0, 400));
        return msgs.map((t, i) => (i % 2 === 0 ? 'User: ' : 'Assistant: ') + t).join('\n\n');
      }
    },
    perplexity: {
      input: ['textarea[placeholder]', 'div[contenteditable="true"]', 'textarea'],
      conversation: () => {
        const users = [...document.querySelectorAll('[data-author="user"]')].slice(-4)
          .map((n) => 'User: ' + (n.innerText || '').trim().slice(0, 400));
        return users.join('\n\n');
      }
    },
    generic: {
      input: ['div[contenteditable="true"]', 'textarea'],
      conversation: () => ''
    }
  };
  const AD = ADAPTERS[SITE] || ADAPTERS.generic;

  function findInput() {
    for (const sel of AD.input) {
      const nodes = document.querySelectorAll(sel);
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        if (r.width > 40 && r.height > 18 && isVisible(n)) return n;
      }
    }
    return null;
  }

  function isVisible(el) {
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function readInput(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  function writeInput(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // contenteditable: select all, then replace via insertText (triggers framework listeners)
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
    return true;
  }

  function getConversation() {
    try { return AD.conversation() || ''; } catch (_) { return ''; }
  }

  // ---------------------------------------------------------- settings

  let settings = null;
  let cachedTemplates = [];

  async function loadSettings() {
    try {
      const res = await send('GET_SETTINGS');
      settings = (res && res.settings) || null;
    } catch (_) { settings = null; }
    if (!settings) settings = { appearance: { theme: 'dark', accent: 'violet', fontSize: 'medium', panelPosition: 'auto' }, behavior: { toastDuration: 2600 } };
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      let done = false;
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          done = true;
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res);
        });
        // If the worker is asleep the callback can never fire on some browsers.
        setTimeout(() => { if (!done) reject(new Error('Background unavailable')); }, 15000);
      } catch (e) { reject(e); }
    });
  }

  // -------------------------------------------------------------- CSS

  const ACCENTS = {
    violet: '#8b5cf6', blue: '#3b82f6', green: '#10b981',
    orange: '#f59e0b', pink: '#ec4899', red: '#ef4444'
  };

  function accent() {
    return ACCENTS[(settings && settings.appearance && settings.appearance.accent) || 'violet'] || ACCENTS.violet;
  }
  function isLight() {
    return !!(settings && settings.appearance && settings.appearance.theme === 'light');
  }

  function panelCss() {
    const light = isLight();
    const a = accent();
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      .panel {
        position: fixed; z-index: 2147483646; width: min(680px, calc(100vw - 24px));
        max-height: min(76vh, 640px); display: flex; flex-direction: column;
        background: ${light ? '#ffffff' : '#14141b'};
        color: ${light ? '#1a1a24' : '#e8e8f0'};
        border: 1px solid ${light ? '#d9d9e3' : '#2c2c3a'};
        border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,${light ? '.18' : '.55'});
        font-size: ${(settings && settings.appearance && settings.appearance.fontSize === 'small' && '13px') ||
                    (settings && settings.appearance && settings.appearance.fontSize === 'large' && '16px') || '14px'};
      }
      .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid ${light ? '#ececf2' : '#23232f'}; cursor: move; user-select: none; }
      .logo { width: 22px; height: 22px; border-radius: 6px; background: ${a}; display: grid; place-items: center; font-size: 13px; }
      .title { font-weight: 700; font-size: 13px; letter-spacing: .2px; flex: 1; }
      .mode-badge { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; border: 1px solid ${a}; color: ${a}; }
      .icon-btn { background: none; border: none; color: inherit; opacity: .6; cursor: pointer; font-size: 15px; padding: 2px 6px; border-radius: 6px; }
      .icon-btn:hover { opacity: 1; background: ${light ? '#f0f0f5' : '#23232f'}; }
      .body { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
      .scores { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
      .score { text-align: center; }
      .score .num { font-weight: 700; font-size: 15px; }
      .score .lbl { font-size: 10px; opacity: .65; margin-top: 1px; }
      .bar { height: 4px; border-radius: 2px; background: ${light ? '#e6e6ee' : '#26263a'}; margin-top: 4px; overflow: hidden; }
      .bar i { display: block; height: 100%; background: ${a}; border-radius: 2px; }
      .sec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; opacity: .55; }
      .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .compare .col { min-width: 0; }
      .compare textarea, .compare .orig {
        width: 100%; min-height: 150px; max-height: 240px; resize: vertical;
        background: ${light ? '#f7f7fa' : '#1b1b26'};
        color: inherit; border: 1px solid ${light ? '#d9d9e3' : '#2c2c3a'};
        border-radius: 10px; padding: 10px; font-size: 12.5px; line-height: 1.5;
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; white-space: pre-wrap;
      }
      .compare .orig { overflow: auto; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .tag { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid ${light ? '#d9d9e3' : '#2c2c3a'}; opacity: .85; }
      .tag.warn { border-color: #ef4444; color: #ef4444; }
      .tag.learn { border-color: ${a}; color: ${a}; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      button.act {
        border: none; border-radius: 9px; padding: 8px 14px; font-size: 12.5px; font-weight: 600;
        cursor: pointer; background: ${light ? '#ececf2' : '#262633'}; color: inherit;
      }
      button.act:hover { filter: brightness(1.12); }
      button.act.primary { background: ${a}; color: #fff; }
      .spin { width: 26px; height: 26px; border: 3px solid ${light ? '#e0e0ea' : '#2c2c3a'}; border-top-color: ${a};
              border-radius: 50%; animation: spin 0.8s linear infinite; margin: 18px auto; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .empty { opacity: .6; text-align: center; padding: 10px; font-size: 12.5px; }
      .tpl-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .tpl { text-align: left; border: 1px solid ${light ? '#d9d9e3' : '#2c2c3a'}; background: none; color: inherit;
             border-radius: 10px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
      .tpl:hover { border-color: ${a}; }
      .tpl b { display: block; font-size: 12.5px; margin-bottom: 2px; }
      .tpl span { opacity: .6; font-size: 11px; }
      .toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; }
      .toast { background: ${light ? '#1a1a24' : '#f4f4f8'}; color: ${light ? '#fff' : '#14141b'};
               padding: 9px 14px; border-radius: 10px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
               animation: slidein .18s ease-out; max-width: 320px; }
      .toast.err { background: #ef4444; color: #fff; }
      .toast.ok { background: #10b981; color: #fff; }
      @keyframes slidein { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      @media (max-width: 700px) { .compare { grid-template-columns: 1fr; } .scores { grid-template-columns: repeat(3, 1fr); } }
    `;
  }

  // ----------------------------------------------------------- shadow UI

  let host = null;
  let root = null;

  function ensureHost() {
    if (root) return root;
    host = document.createElement('div');
    host.id = 'prism-host';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    return root;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(message, kind) {
    const r = ensureHost();
    const dur = (settings && settings.behavior && settings.behavior.toastDuration) || 2600;
    const el = document.createElement('div');
    el.className = 'toast-host';
    el.innerHTML = '<div class="toast ' + (kind || '') + '">' + esc(message) + '</div>';
    r.appendChild(el);
    setTimeout(() => el.remove(), dur);
  }

  function scoreColor(v) {
    return v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
  }

  function closePanel() {
    if (host) host.remove();
    host = null; root = null;
  }

  // ------------------------------------------------------ coach actions

  let lastCoach = null;

  async function coachCurrentPrompt(preselected) {
    const input = findInput();
    const promptText = (preselected && preselected.trim()) || readInput(input).trim();
    if (!promptText) {
      toast('Type or select a prompt first, then press the coach button.', 'err');
      openPanel({ empty: 'No prompt detected. Type or select some text and try again.' });
      return;
    }
    openPanel({ loading: true });
    const conversation = getConversation();
    try {
      const res = await send({ type: 'COACH', prompt: promptText, conversation, site: SITE });
      if (!res || !res.ok) {
        if (res && res.code === 'PRIVACY_OPT_IN_REQUIRED') {
          openPanel({ error: res.error, needOptions: true });
        } else {
          openPanel({ error: (res && res.error) || 'Coaching failed. Please try again.' });
        }
        toast((res && res.error) || 'Coaching failed.', 'err');
        return;
      }
      lastCoach = { original: promptText, optimized: res.optimized, analysis: res.analysis, notes: res.notes || [], mode: res.mode };
      openPanel({ result: lastCoach });
      toast(res.mode === 'offline' ? 'Coached with the built-in rule engine' :
            res.mode === 'offline-fallback' ? 'AI unavailable — used rule-based coach' : 'Prompt optimized with AI', res.mode === 'offline-fallback' ? '' : 'ok');
    } catch (e) {
      openPanel({ error: 'Network error — could not reach the Prism background. Please try again.' });
      toast('Network error, please try again.', 'err');
    }
  }

  // ----------------------------------------------------------- panel

  function openPanel(state) {
    const r = ensureHost();
    const style = document.createElement('style');
    style.textContent = panelCss();
    r.innerHTML = '';
    r.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'panel';

    if (state && state.mini === undefined && !state.loading && !state.result && !state.error && !state.templates && !state.empty) {
      state = { empty: 'Select an action below.' };
    }

    panel.innerHTML = `
      <div class="head">
        <div class="logo">🎓</div>
        <div class="title">Prism</div>
        <span class="mode-badge">${esc(state && state.result ? (state.result.mode === 'offline' || state.result.mode === 'offline-fallback' ? 'rule-based' : 'AI') : (settings && settings.provider !== 'offline' ? 'AI: ' + settings.provider : 'offline'))}</span>
        <button class="icon-btn" data-x="templates" title="Templates">📋</button>
        <button class="icon-btn" data-x="close" title="Close">✕</button>
      </div>
      <div class="body"></div>
    `;
    r.appendChild(panel);

    const body = panel.querySelector('.body');
    renderBody(body, state);

    panel.querySelector('[data-x="close"]').addEventListener('click', closePanel);
    panel.querySelector('[data-x="templates"]').addEventListener('click', () => openTemplates());

    // Drag to move
    const head = panel.querySelector('.head');
    makeDraggable(panel, head);

    // Position: avoid overlapping the input — place above input, else right side.
    positionPanel(panel);

    return panel;
  }

  function positionPanel(panel) {
    const input = findInput();
    const m = 14;
    if (input) {
      const rect = input.getBoundingClientRect();
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      let left = Math.min(Math.max(m, rect.right - pw), window.innerWidth - pw - m);
      let top = rect.top - ph - 10;
      if (top < m) top = Math.min(rect.bottom + 10, window.innerHeight - ph - m);
      panel.style.left = Math.max(m, left) + 'px';
      panel.style.top = Math.max(m, top) + 'px';
    } else {
      panel.style.right = '20px';
      panel.style.bottom = '90px';
    }
  }

  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, down = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      down = true; sx = e.clientX; sy = e.clientY;
      ox = panel.offsetLeft; oy = panel.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!down) return;
      panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => { down = false; });
  }

  function renderBody(body, state) {
    if (state.loading) {
      body.innerHTML = '<div class="spin"></div><div class="empty">Analyzing your prompt…</div>';
      return;
    }
    if (state.error) {
      body.innerHTML = '<div class="empty">⚠️ ' + esc(state.error) + '</div>' +
        (state.needOptions ? '<div class="actions"><button class="act primary" data-x="options">Open settings</button></div>' : '');
      const b = body.querySelector('[data-x="options"]');
      if (b) b.addEventListener('click', () => send({ type: 'OPEN_OPTIONS' }));
      return;
    }
    if (state.empty) {
      body.innerHTML = '<div class="empty">' + esc(state.empty) + '</div>' +
        '<div class="actions"><button class="act primary" data-x="coach">✨ Coach my prompt</button></div>';
      body.querySelector('[data-x="coach"]').addEventListener('click', () => coachCurrentPrompt());
      return;
    }
    if (state.templates) {
      renderTemplates(body);
      return;
    }
    if (state.result) renderResult(body, state.result);
  }

  function renderResult(body, result) {
    const s = result.analysis.scores;
    const dim = (v) => `<div class="score"><div class="num" style="color:${scoreColor(v)}">${v}</div><div class="bar"><i style="width:${v}%"></i></div></div>`;

    body.innerHTML = `
      <div class="scores">
        ${dim(s.clarity)}${dim(s.specificity)}${dim(s.efficiency)}${dim(s.safety)}
        <div class="score"><div class="num" style="color:${accent()}">${s.overall}</div><div class="bar"><i style="width:${s.overall}%"></i></div></div>
      </div>
      <div class="tags">
        <span class="tag">goal: ${esc(result.analysis.goal)}</span>
        <span class="tag">tone: ${esc(result.analysis.tone)}</span>
        <span class="tag">~${result.analysis.wordCount} words · ~${result.analysis.tokenEstimate} tokens</span>
        ${(result.notes || []).map((n) => `<span class="tag ${n.type === 'warn' ? 'warn' : n.type === 'learn' ? 'learn' : ''}">${esc(n.text)}</span>`).join('')}
        ${result.analysis.safetyIssues.map((i) => `<span class="tag warn">⚠ ${esc(i.message)}</span>`).join('')}
      </div>
      <div class="sec-title">Original vs optimized</div>
      <div class="compare">
        <div class="col">
          <div class="sec-title" style="margin-bottom:4px">Original</div>
          <div class="orig">${esc(result.original)}</div>
        </div>
        <div class="col">
          <div class="sec-title" style="margin-bottom:4px">Optimized <span style="opacity:.5">(editable)</span></div>
          <textarea class="opt">${esc(result.optimized)}</textarea>
        </div>
      </div>
      <div class="actions">
        <button class="act primary" data-x="replace">Replace prompt</button>
        <button class="act" data-x="copy">Copy optimized</button>
        <button class="act" data-x="favorite">☆ Favorite</button>
        <button class="act" data-x="rerun">↻ Re-coach</button>
      </div>
    `;

    body.querySelector('[data-x="replace"]').addEventListener('click', () => {
      const input = findInput();
      const text = body.querySelector('.opt').value;
      if (!input) return toast('Could not find the chat input on this page.', 'err');
      writeInput(input, text);
      toast('Prompt replaced — review and send.', 'ok');
      closePanel();
    });
    body.querySelector('[data-x="copy"]').addEventListener('click', async () => {
      const text = body.querySelector('.opt').value;
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard.', 'ok');
      } catch (_) {
        // Fallback: background clipboard (has host permissions) → then execCommand
        try { await send({ type: 'COPY_TEXT', text }); toast('Copied to clipboard.', 'ok'); }
        catch (_2) { toast('Copy failed — select the text manually.', 'err'); }
      }
    });
    body.querySelector('[data-x="favorite"]').addEventListener('click', async (e) => {
      try {
        const res = await send({
          type: 'SAVE_AI_RESULT',
          entry: { original: result.original, optimized: result.optimized, site: SITE, goal: result.analysis.goal, mode: result.mode, score: result.analysis.scores.overall, favorite: true }
        });
        if (res && res.ok) { e.target.textContent = '★ Favorited'; toast('Saved to favorites.', 'ok'); }
      } catch (_) { toast('Could not save favorite.', 'err'); }
    });
    body.querySelector('[data-x="rerun"]').addEventListener('click', () => coachCurrentPrompt(result.original));
  }

  async function openTemplates() {
    openPanel({ loading: true });
    try {
      const res = await send({ type: 'GET_TEMPLATES' });
      cachedTemplates = (res && res.templates) || [];
      openPanel({ templates: true });
    } catch (_) {
      openPanel({ error: 'Could not load templates.' });
    }
  }

  function renderTemplates(body) {
    if (!cachedTemplates.length) {
      body.innerHTML = '<div class="empty">No templates found.</div>';
      return;
    }
    body.innerHTML = '<div class="sec-title">Insert a template</div><div class="tpl-list"></div>';
    const list = body.querySelector('.tpl-list');
    for (const t of cachedTemplates) {
      const b = document.createElement('button');
      b.className = 'tpl';
      b.innerHTML = '<b>' + esc((t.icon || '') + ' ' + t.name) + '</b><span>' + esc(t.category || '') + (t.description ? ' — ' + esc(t.description) : '') + '</span>';
      b.addEventListener('click', () => {
        const input = findInput();
        if (!input) return toast('Could not find the chat input.', 'err');
        // Insert the raw template as-is. {placeholders} stay intact so the user
        // can edit them directly in the chat box — no window.prompt() dialogs.
        writeInput(input, t.template);
        toast('Template inserted — edit the {placeholders} in place.', 'ok');
        closePanel();
      });
      list.appendChild(b);
    }
  }

  // ------------------------------------------------- floating button

  let fab = null;

  function ensureFab() {
    if (fab || !(settings && settings.behavior && settings.behavior.showButtonOnSites !== false)) return;
    fab = document.createElement('div');
    fab.id = 'prism-fab';
    fab.title = 'Prism (Ctrl+Shift+E)';
    fab.style.cssText = [
      'position:fixed', 'z-index:2147483645', 'width:40px', 'height:40px', 'border-radius:50%',
      'background:' + accent(), 'color:#fff', 'display:grid', 'place-items:center', 'font-size:19px',
      'cursor:pointer', 'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'user-select:none',
      'transition:transform .12s ease, box-shadow .12s ease'
    ].join(';');
    fab.textContent = '💎';
    fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.08)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
    fab.addEventListener('click', () => coachCurrentPrompt());
    document.documentElement.appendChild(fab);
    positionFab();
  }

  function positionFab() {
    if (!fab) return;
    const input = findInput();
    if (input) {
      const rect = input.getBoundingClientRect();
      const left = Math.min(rect.right - 28, window.innerWidth - 56);
      const top = Math.max(8, rect.top - 46);
      fab.style.left = Math.max(8, left) + 'px';
      fab.style.top = top + 'px';
    } else {
      fab.style.right = '20px';
      fab.style.bottom = '20px';
      fab.style.left = 'auto';
      fab.style.top = 'auto';
    }
  }

  // ------------------------------------------------------- observers

  let repositionScheduled = false;
  const ro = new ResizeObserver(() => {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
      repositionScheduled = false;
      positionFab();
      const panel = root && root.querySelector ? root.querySelector('.panel') : null;
      if (panel && panel.style.top) positionPanel(panel);
    });
  });

  function startObservers() {
    ro.observe(document.documentElement);
    const mo = new MutationObserver(() => {
      clearTimeout(startObservers._t);
      startObservers._t = setTimeout(() => {
        ensureFab();
        positionFab();
      }, 350);
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // -------------------------------------------------------- shortcuts

  window.addEventListener('keydown', (e) => {
    // In-page fallback for Ctrl+Shift+E (commands API also fires TRIGGER_COACH)
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      // Let the site keep its own binding if it stops propagation.
      e.preventDefault();
      e.stopPropagation();
      coachCurrentPrompt();
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'TRIGGER_COACH') coachCurrentPrompt(msg.selection || '');
    if (msg.type === 'SETTINGS_UPDATED') { settings = msg.settings; if (fab) { fab.style.background = accent(); } }
  });

  // ------------------------------------------------------------- init

  (async function init() {
    await loadSettings();
    ensureFab();
    startObservers();
    window.addEventListener('resize', positionFab);
  })();
})();
