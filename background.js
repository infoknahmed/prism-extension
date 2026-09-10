/**
 * Prism — background script (service worker on Chromium, event page on Firefox).
 * Central hub: message routing, AI coach orchestration, context menu,
 * keyboard command, install-time setup.
 */
'use strict';

// ------------------------------------------------------------- imports

importScripts(
  'utils/storage.js',
  'utils/promptAnalyzer.js',
  'utils/templateManager.js',
  'utils/api.js'
);

const OFFLINE = 'offline';

// ------------------------------------------------------ install / menus

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await CoachStorage.getSettings();
    await CoachStorage.saveSettings(settings); // normalize + persist defaults
  } catch (_) { /* storage may be transiently unavailable */ }

  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'coach-selection',
        title: 'Prism: improve "%s"',
        contexts: ['selection', 'editable']
      });
    });
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    }
  } catch (_) { /* contextMenus can be missing on some browsers */ }
});

// ------------------------------------------------------ keyboard shortcut

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'coach-current-prompt') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_COACH' }, () => void chrome.runtime.lastError);
  } catch (_) { /* tab may not have the content script */ }
});

// ------------------------------------------------------- context menu

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'coach-selection' || !tab || !tab.id) return;
  try {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_COACH', selection: info.selectionText || '' }, () => void chrome.runtime.lastError);
  } catch (_) { /* ignore */ }
});

// --------------------------------------------------------- messaging

const ROUTES = {
  GET_SETTINGS: async () => ({ ok: true, settings: await CoachStorage.getSettings() }),

  GET_TEMPLATES: async () => ({ ok: true, templates: await CoachTemplateManager.getAllTemplates() }),

  SAVE_AI_RESULT: async (msg) => {
    await CoachStorage.addHistoryEntry((msg && msg.entry) || {});
    await CoachStorage.recordLearning({ goal: (msg && msg.entry && msg.entry.goal) || '', action: 'ai' });
    return { ok: true };
  },

  OPEN_OPTIONS: async () => {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  },

  COACH: (msg) => handleCoach(msg)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return undefined;
  const handler = ROUTES[msg.type];
  if (!handler) return undefined;

  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: (e && e.message) || 'Unexpected error' }));

  return true; // keep the channel open for the async response
});

// ---------------------------------------------------------- coach flow

async function handleCoach(msg) {
  const settings = await CoachStorage.getSettings();
  const provider = msg.provider || settings.provider || OFFLINE;
  const wantCloud = provider !== OFFLINE;

  const promptText = String(msg.prompt || '').trim();
  if (!promptText) {
    return { ok: false, error: 'No prompt text found. Type or select some text first.' };
  }

  // Privacy gate: cloud AI requires explicit opt-in.
  if (wantCloud && !settings.privacy.allowCloudAi) {
    return {
      ok: false,
      code: 'PRIVACY_OPT_IN_REQUIRED',
      error: 'Cloud AI is off in your privacy settings. Enable "Allow cloud AI" in Prism options to use ' + provider + '.'
    };
  }

  const analysis = PrismAnalyzer.analyze(promptText, {
    conversation: msg.conversation || '',
    site: msg.site || ''
  });

  let optimizedText = '';
  let notes = [];
  let mode = OFFLINE;
  let model = null;

  if (!wantCloud) {
    // ---------------- rule-based offline coach ----------------
    let prefs = { tone: settings.learning.tonePreference || 'auto', length: null };
    if (settings.learning.enabled) {
      const hints = PrismAnalyzer.learnFromHistory(
        await CoachStorage.getHistory(),
        await CoachStorage.getLearningProfile()
      );
      if (hints.suggestTone) prefs.tone = hints.suggestTone;
      const top = hints.topGoals[0];
      if (top && top === analysis.goal) {
        notes.push({ type: 'learn', text: 'You work on "' + top + '" tasks often — this shape is based on your history.' });
      }
    }
    const r = PrismAnalyzer.suggestOffline(promptText, analysis, prefs);
    optimizedText = r.optimized;
    notes = notes.concat(r.notes);
    mode = OFFLINE;
  } else {
    // ---------------- AI-powered coach ----------------
    const apiKey = await CoachStorage.getApiKey(provider);
    try {
      const r = await CoachApi.callLlm({
        prompt: promptText,
        analysis,
        context: { conversation: msg.conversation || '', site: msg.site || '' },
        settings: Object.assign({}, settings, { apiKeys: {} }), // keys travel separately, encrypted
        apiKey,
        provider,
        model: msg.model || undefined
      });
      optimizedText = r.text;
      mode = 'ai';
      model = r.model;
      if (r.cached) notes.push({ type: 'info', text: 'Served from cache (no API call made).' });
    } catch (e) {
      // Degrade gracefully: never block the user on an API failure.
      const r = PrismAnalyzer.suggestOffline(promptText, analysis, {});
      await CoachStorage.addHistoryEntry({
        original: promptText,
        optimized: r.optimized,
        site: msg.site || '',
        goal: analysis.goal,
        mode: 'offline-fallback',
        provider: OFFLINE,
        score: analysis.scores.overall
      });
      return {
        ok: true,
        mode: 'offline-fallback',
        analysis,
        optimized: r.optimized,
        notes: [{ type: 'warn', text: (e.message || 'API error') + ' — showing the rule-based result instead.' }],
        provider: OFFLINE,
        model: null
      };
    }
  }

  // Persist history + learning signal.
  await CoachStorage.addHistoryEntry({
    original: promptText,
    optimized: optimizedText,
    site: msg.site || '',
    goal: analysis.goal,
    mode,
    provider,
    score: analysis.scores.overall
  });
  await CoachStorage.recordLearning({ goal: analysis.goal, action: mode });

  return {
    ok: true,
    mode,
    analysis,
    optimized: optimizedText,
    notes,
    provider,
    model,
    cached: mode === 'ai' && notes.some((n) => n.type === 'info')
  };
}
