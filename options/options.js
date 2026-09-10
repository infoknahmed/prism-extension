/**
 * Prism — options page logic.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------- tabs

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ----------------------------------------------------------- toasts

  function toast(msg, kind) {
    const host = $('toastHost');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  // --------------------------------------------------------- settings

  let settings = null;

  const PROVIDER_KEYS = ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama'];

  async function loadSettings() {
    settings = await CoachStorage.getSettings();
    applyTheme();
    $('provider').value = settings.provider;
    $('model').value = (settings.models && settings.models[settings.provider]) || '';
    $('ollamaUrl').value = settings.ollamaUrl || 'http://localhost:11434';
    $('allowCloud').checked = !!(settings.privacy && settings.privacy.allowCloudAi);
    $('showFab').checked = settings.behavior.showButtonOnSites !== false;
    $('learning').checked = settings.learning.enabled !== false;
    $('tone').value = settings.learning.tonePreference || 'auto';
    $('theme').value = settings.appearance.theme;
    $('accent').value = settings.appearance.accent;
    $('fontSize').value = settings.appearance.fontSize;
    updateEngineUi();
  }

  function applyTheme() {
    const a = settings.appearance || {};
    document.body.className = 'theme-' + (a.theme || 'dark') + ' accent-' + (a.accent || 'violet');
  }

  function updateEngineUi() {
    const p = settings.provider;
    $('modelRow').style.display = p === 'offline' ? 'none' : '';
    $('ollamaRow').style.display = p === 'ollama' ? '' : 'none';
    const hints = {
      offline: 'The rule-based coach runs entirely on this device — no network, no API key needed.',
      openai: 'Get a key at platform.openai.com — stored encrypted, used only for rewrites.',
      anthropic: 'Get a key at console.anthropic.com — stored encrypted, used only for rewrites.',
      gemini: 'Get a key at aistudio.google.com — stored encrypted, used only for rewrites.',
      openrouter: 'One key, hundreds of models — openrouter.ai/keys.',
      ollama: 'Run locally. Start Ollama with: OLLAMA_ORIGINS="chrome-extension://*" ollama serve'
    };
    $('engineHint').textContent = hints[p] || '';
  }

  $('provider').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ provider: e.target.value });
    $('model').value = (settings.models && settings.models[settings.provider]) || '';
    updateEngineUi();
    notifyTabs();
    toast('Provider saved.', 'ok');
  });

  $('model').addEventListener('change', async (e) => {
    const models = Object.assign({}, settings.models);
    models[settings.provider] = e.target.value.trim();
    settings = await CoachStorage.saveSettings({ models });
    toast('Model saved.', 'ok');
  });

  $('ollamaUrl').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ ollamaUrl: e.target.value.trim() || 'http://localhost:11434' });
    toast('Ollama URL saved.', 'ok');
  });

  $('allowCloud').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ privacy: { allowCloudAi: e.target.checked } });
    notifyTabs();
  });

  $('showFab').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ behavior: { showButtonOnSites: e.target.checked } });
    notifyTabs();
  });

  $('learning').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ learning: { enabled: e.target.checked } });
  });

  $('tone').addEventListener('change', async (e) => {
    settings = await CoachStorage.saveSettings({ learning: { tonePreference: e.target.value } });
  });

  ['theme', 'accent', 'fontSize'].forEach((k) => {
    $(k).addEventListener('change', async (e) => {
      settings = await CoachStorage.saveSettings({ appearance: { [k]: e.target.value } });
      applyTheme();
      notifyTabs();
      toast('Appearance saved.', 'ok');
    });
  });

  function notifyTabs() {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs || []) {
        try { chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_UPDATED', settings }, () => void chrome.runtime.lastError); } catch (_) {}
      }
    });
  }

  // -------------------------------------------------------- API keys

  $('saveKeys').addEventListener('click', async () => {
    let saved = 0;
    for (const p of ['openai', 'anthropic', 'gemini', 'openrouter']) {
      const input = $('key-' + p);
      if (!input) continue;
      if (input.value.trim()) {
        await CoachStorage.setApiKey(p, input.value.trim());
        input.value = '';
        saved++;
      }
    }
    $('keysStatus').textContent = saved ? saved + ' key(s) saved encrypted.' : 'Nothing to save — enter at least one key.';
    toast(saved ? 'Keys saved (encrypted).' : 'No keys entered.', saved ? 'ok' : 'err');
  });

  $('wipeKeys').addEventListener('click', async () => {
    await CoachStorage.wipeSecrets();
    $('keysStatus').textContent = 'All API keys deleted from this device.';
    toast('All keys deleted.', 'ok');
  });

  // ------------------------------------------------------- templates

  async function renderTemplates() {
    const all = await CoachTemplateManager.getAllTemplates();
    const custom = all.filter((t) => t.custom);
    const builtin = all.filter((t) => !t.custom);

    $('customTemplates').innerHTML = custom.length ? '' : '<p class="hint">No custom templates yet — click "+ New".</p>';
    for (const t of custom) $('customTemplates').appendChild(templateCard(t, true));
    $('builtinTemplates').innerHTML = '';
    for (const t of builtin) $('builtinTemplates').appendChild(templateCard(t, false));
  }

  function templateCard(t, isCustom) {
    const card = document.createElement('div');
    card.className = 'tpl-card';
    const placeholders = CoachTemplateManager.placeholders(t.template);
    card.innerHTML =
      '<div class="t-head"><span>' + esc(t.icon || '⭐') + '</span>' +
      '<span class="t-name">' + esc(t.name) + '</span>' +
      '<span class="t-cat">' + esc(t.category || '') + '</span></div>' +
      '<div class="t-desc">' + esc(t.description || '') + '</div>' +
      '<pre>' + esc(t.template) + '</pre>' +
      '<div class="t-actions"></div>' +
      (placeholders.length ? '<p class="hint">Placeholders: ' + placeholders.map((p) => '{' + esc(p) + '}').join(', ') + '</p>' : '');

    const actions = card.querySelector('.t-actions');
    const copy = document.createElement('button');
    copy.className = 'btn small';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(t.template); toast('Template copied.', 'ok'); }
      catch (_) { toast('Copy failed.', 'err'); }
    });
    actions.appendChild(copy);

    if (isCustom) {
      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editTemplate(t));
      actions.appendChild(edit);

      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        await CoachStorage.deleteCustomTemplate(t.id);
        await renderTemplates();
        toast('Template deleted.', 'ok');
      });
      actions.appendChild(del);
    }
    return card;
  }

  /**
   * Inline template editor — replaces the old window.prompt() flow with a
   * form rendered directly inside the Templates tab (no browser dialogs).
   */
  function editTemplate(t) {
    // Toggle: clicking "+ New" while the editor is open closes it.
    const existing = $('templateEditor');
    if (existing && !t) { existing.remove(); return; }
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.className = 'tpl-card tpl-editor';
    form.id = 'templateEditor';
    form.innerHTML =
      '<div class="t-head"><span class="t-name">' + (t ? 'Edit template' : 'New template') + '</span></div>' +
      '<div class="editor-grid">' +
      '  <label class="editor-field"><span>Name</span><input type="text" id="tplName" /></label>' +
      '  <label class="editor-field"><span>Category</span><input type="text" id="tplCategory" /></label>' +
      '  <label class="editor-field"><span>Emoji icon</span><input type="text" id="tplIcon" maxlength="4" /></label>' +
      '</div>' +
      '<label class="editor-field"><span>Template text (use {placeholders} like {topic})</span>' +
      '  <textarea id="tplBody" rows="6"></textarea></label>' +
      '<div class="actions"><button class="btn primary small" id="tplSave">Save template</button>' +
      '<button class="btn small" id="tplCancel">Cancel</button></div>';

    const nameIn = form.querySelector('#tplName');
    const catIn = form.querySelector('#tplCategory');
    const iconIn = form.querySelector('#tplIcon');
    const bodyIn = form.querySelector('#tplBody');
    nameIn.value = t ? t.name : 'My template';
    catIn.value = t ? (t.category || 'Custom') : 'Custom';
    iconIn.value = t ? (t.icon || '⭐') : '⭐';
    bodyIn.value = t ? t.template : '';

    form.querySelector('#tplCancel').addEventListener('click', () => form.remove());
    form.querySelector('#tplSave').addEventListener('click', async () => {
      const body = bodyIn.value;
      if (!body.trim()) return toast('Template text required.', 'err');
      const record = {
        id: t ? t.id : undefined,
        name: nameIn.value.trim() || 'Untitled',
        category: catIn.value.trim() || 'Custom',
        icon: iconIn.value.trim() || '⭐',
        description: 'Custom template',
        template: body
      };
      await CoachStorage.saveCustomTemplate(record);
      form.remove();
      await renderTemplates();
      toast('Template saved.', 'ok');
    });

    $('customTemplates').prepend(form);
    nameIn.focus();
  }

  $('newTemplate').addEventListener('click', () => editTemplate(null));

  // --------------------------------------------------------- history

  async function renderHistory() {
    const history = await CoachStorage.getHistory();
    const list = $('historyList');
    list.innerHTML = history.length ? '' : '<p class="hint">No coached prompts yet.</p>';
    for (const item of history) {
      const el = document.createElement('div');
      el.className = 'h-item';
      el.innerHTML =
        '<div class="h-top">' +
        '<span class="h-goal">' + esc(item.goal || 'general') + '</span>' +
        '<span class="h-mode">' + esc(item.mode || 'offline') + (item.site ? ' · ' + esc(item.site) : '') + '</span>' +
        '<span class="h-date">' + new Date(item.ts).toLocaleString() + '</span>' +
        '<button class="h-fav" title="Toggle favorite">' + (item.favorite ? '★' : '☆') + '</button>' +
        '</div>' +
        '<div class="h-pair">' +
        '<div><div class="lbl">Original</div>' + esc(item.original) + '</div>' +
        '<div><div class="lbl">Optimized</div>' + esc(item.optimized) + '</div>' +
        '</div>';
      el.querySelector('.h-fav').addEventListener('click', async () => {
        await CoachStorage.toggleFavorite(item.id);
        await renderHistory();
      });
      el.querySelector('.h-pair').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(item.optimized); toast('Optimized prompt copied.', 'ok'); }
        catch (_) { toast('Copy failed.', 'err'); }
      });
      list.appendChild(el);
    }
  }

  $('clearHistory').addEventListener('click', async () => {
    if (!window.confirm('Delete the entire coaching history?')) return;
    await CoachStorage.clearHistory();
    await renderHistory();
    toast('History cleared.', 'ok');
  });

  // ---------------------------------------------------- export/import

  $('exportBtn').addEventListener('click', async () => {
    const data = await CoachStorage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prism-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Backup exported.', 'ok');
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const replace = window.confirm('OK = REPLACE all current data with the backup.\nCancel = MERGE the backup into existing data.');
      await CoachStorage.importAll(data, { replace });
      await loadSettings();
      await renderTemplates();
      await renderHistory();
      toast('Import complete.', 'ok');
    } catch (err) {
      toast('Import failed: ' + (err.message || 'invalid file'), 'err');
    }
    e.target.value = '';
  });

  $('resetBtn').addEventListener('click', async () => {
    if (!window.confirm('Reset ALL settings to defaults? History and templates are kept.')) return;
    await CoachStorage.resetSettings();
    await loadSettings();
    toast('Settings reset to defaults.', 'ok');
  });

  // ------------------------------------------------------------ utils

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------- init

  (async () => {
    await loadSettings();
    await renderTemplates();
    await renderHistory();
  })();
})();
