/**
 * Prism — popup logic.
 * Shows status, quick settings, recent history; can trigger a coach on the
 * active tab and copy/replace the optimized prompt.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const el = {
    status: $('status'),
    provider: $('provider'),
    allowCloud: $('allowCloud'),
    theme: $('theme'),
    accent: $('accent'),
    coachTab: $('coachTab'),
    history: $('history'),
    historyEmpty: $('historyEmpty'),
    clearHistory: $('clearHistory'),
    openOptions: $('openOptions'),
    openFavorites: $('openFavorites'),
    modeBadge: $('modeBadge')
  };

  let settings = null;

  function send(msg) {
    return new Promise((resolve, reject) => {
      let done = false;
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          done = true;
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res);
        });
        setTimeout(() => { if (!done) reject(new Error('Background unavailable')); }, 15000);
      } catch (e) { reject(e); }
    });
  }

  function applyTheme(s) {
    const a = s.appearance || {};
    document.body.className = 'theme-' + (a.theme || 'dark') + ' accent-' + (a.accent || 'violet');
  }

  async function init() {
    try {
      const res = await send({ type: 'GET_SETTINGS' });
      settings = (res && res.settings) || null;
    } catch (_) { settings = null; }
    if (!settings) {
      el.status.textContent = 'Storage unavailable — defaults in use.';
      settings = { provider: 'offline', privacy: { allowCloudAi: false }, appearance: {}, models: {} };
    }
    applyTheme(settings);
    el.provider.value = settings.provider || 'offline';
    el.allowCloud.checked = !!(settings.privacy && settings.privacy.allowCloudAi);
    el.theme.value = (settings.appearance && settings.appearance.theme) || 'dark';
    el.accent.value = (settings.appearance && settings.appearance.accent) || 'violet';
    el.modeBadge.textContent = settings.provider === 'offline'
      ? 'rule-based'
      : (settings.privacy.allowCloudAi ? 'AI: ' + settings.provider : 'AI off (privacy)');
    el.status.textContent = settings.provider === 'offline'
      ? 'Ready — rule-based coach'
      : (settings.privacy.allowCloudAi ? 'Ready — AI coach (' + settings.provider + ')' : 'Cloud AI disabled in privacy settings');

    await renderHistory();
  }

  async function renderHistory() {
    let history = [];
    try { history = await CoachStorage.getHistory(); } catch (_) { history = []; }
    el.history.innerHTML = '';
    el.historyEmpty.classList.toggle('hidden', history.length > 0);
    for (const item of history.slice(0, 8)) {
      const li = document.createElement('li');
      li.title = 'Click to copy the optimized prompt';
      li.innerHTML =
        (item.favorite ? '<span class="fav">★</span>' : '') +
        '<span class="g">' + escapeHtml(item.goal || 'general') + '</span>' +
        '<span class="t">' + escapeHtml((item.original || '').slice(0, 90)) + '</span>';
      li.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(item.optimized || ''); el.status.textContent = 'Optimized prompt copied.'; }
        catch (_) { el.status.textContent = 'Copy failed.'; }
      });
      el.history.appendChild(li);
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // -------------------------------------------------------- handlers

  el.coachTab.addEventListener('click', async () => {
    el.coachTab.disabled = true;
    el.coachTab.textContent = 'Coaching…';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab');
      // Ping the content script; if absent (unsupported site), coach from here.
      let ping = null;
      try { ping = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }); } catch (_) { ping = null; }
      if (ping && ping.ok) {
        await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_COACH' });
        window.close();
        return;
      }
      // Fallback: coach the tab title as a lightweight prompt.
      const title = (tab.title || '').replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini|DeepSeek|Perplexity).*$/i, '').trim();
      if (!title) throw new Error('Nothing to coach on this page.');
      const res = await send({ type: 'COACH', prompt: title, conversation: '', site: 'popup' });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Coaching failed.');
      await navigator.clipboard.writeText(res.optimized);
      el.status.textContent = 'Optimized prompt copied to clipboard.';
      el.coachTab.textContent = '✨ Copied! Open Prism again to reuse';
    } catch (e) {
      el.status.textContent = e.message || 'Could not coach this tab.';
      el.coachTab.disabled = false;
      el.coachTab.textContent = '✨ Coach the prompt on this tab';
    }
  });

  el.provider.addEventListener('change', async () => {
    settings = await CoachStorage.saveSettings({ provider: el.provider.value });
    await init();
  });
  el.allowCloud.addEventListener('change', async () => {
    settings = await CoachStorage.saveSettings({ privacy: { allowCloudAi: el.allowCloud.checked } });
    await init();
  });
  el.theme.addEventListener('change', async () => {
    settings = await CoachStorage.saveSettings({ appearance: { theme: el.theme.value } });
    applyTheme(settings);
    notifyTabs();
  });
  el.accent.addEventListener('change', async () => {
    settings = await CoachStorage.saveSettings({ appearance: { accent: el.accent.value } });
    applyTheme(settings);
    notifyTabs();
  });

  function notifyTabs() {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs || []) {
        try { chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_UPDATED', settings }, () => void chrome.runtime.lastError); } catch (_) {}
      }
    });
  }

  el.clearHistory.addEventListener('click', async () => {
    await CoachStorage.clearHistory();
    await renderHistory();
    el.status.textContent = 'History cleared.';
  });

  el.openOptions.addEventListener('click', () => send({ type: 'OPEN_OPTIONS' }));
  el.openFavorites.addEventListener('click', () => send({ type: 'OPEN_OPTIONS' }));

  init();
})();
