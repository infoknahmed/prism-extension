/**
 * Prism — unified LLM API client.
 *
 * One call signature for five providers:
 *   openai | anthropic | gemini | openrouter | ollama
 *
 * Runs wherever `fetch` exists (service worker, page, popup). API keys are
 * read through CoachStorage (encrypted at rest). Results are cached in
 * chrome.storage under `coach:apiCache` keyed by a request hash with TTL.
 */
(function (root) {
  'use strict';

  const PROVIDERS = {
    openai: {
      label: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      build: (model, messages) => ({
        url: 'https://api.openai.com/v1/chat/completions',
        headers: (k) => ({ 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' }),
        body: () => JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 900 }),
        extract: (data) => data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      })
    },
    anthropic: {
      label: 'Anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      build: (model, messages) => {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const rest = messages.filter((m) => m.role !== 'system');
        return {
          url: 'https://api.anthropic.com/v1/messages',
          headers: (k) => ({
            'x-api-key': k,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'Content-Type': 'application/json'
          }),
          body: () => JSON.stringify({ model, system, messages: rest, max_tokens: 900 }),
          extract: (data) => data && data.content && data.content[0] && data.content[0].text
        };
      }
    },
    gemini: {
      label: 'Google Gemini',
      defaultModel: 'gemini-1.5-flash',
      build: (model, messages) => {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        return {
          url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
          headers: (k) => ({ 'x-goog-api-key': k, 'Content-Type': 'application/json' }),
          body: () => JSON.stringify({ contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined }),
          extract: (data) => data && data.candidates && data.candidates[0] && data.candidates[0].content &&
            data.candidates[0].content.parts && data.candidates[0].content.parts.map((p) => p.text).join('')
        };
      }
    },
    openrouter: {
      label: 'OpenRouter',
      defaultModel: 'openai/gpt-4o-mini',
      build: (model, messages) => ({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: (k) => ({ 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' }),
        body: () => JSON.stringify({ model, messages, max_tokens: 900 }),
        extract: (data) => data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      })
    },
    ollama: {
      label: 'Ollama (local)',
      defaultModel: 'llama3.1',
      build: (model, messages, baseUrl) => ({
        url: (baseUrl || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat',
        headers: () => ({ 'Content-Type': 'application/json' }),
        body: () => JSON.stringify({ model, messages, stream: false }),
        extract: (data) => data && data.message && data.message.content
      })
    }
  };

  // --------------------------------------------------------- messages

  const SYSTEM_PROMPT = [
    'You are Prism, an expert prompt engineer.',
    'Rewrite the user\'s AI prompt so it gets dramatically better results from an AI assistant.',
    'Rules:',
    '- Preserve the user\'s intent; never change what they are asking for.',
    '- Add role, context, constraints, output format and success criteria where missing.',
    '- Be concise: no meta-commentary about yourself, no markdown fences around the whole answer.',
    '- Reply with ONLY the improved prompt text.'
  ].join('\n');

  function userPrompt(text, analysis, context) {
    const parts = [];
    parts.push('Original prompt:\n"""' + text + '"""');
    if (analysis) {
      parts.push('Detected goal: ' + (analysis.goal || 'general'));
      parts.push('Scores (0-100): clarity ' + analysis.scores.clarity + ', specificity ' + analysis.scores.specificity +
        ', efficiency ' + analysis.scores.efficiency + ', safety ' + analysis.scores.safety + '.');
    }
    if (context && context.conversation) {
      const convo = context.conversation.slice(-1200);
      parts.push('Recent conversation for context (do not repeat it, use it to disambiguate):\n"""' + convo + '"""');
    }
    if (context && context.site) parts.push('Site: ' + context.site);
    parts.push('Rewrite the original prompt now. Output only the improved prompt.');
    return parts.join('\n\n');
  }

  // ---------------------------------------------------------- errors

  class ApiError extends Error {
    constructor(message, { status = 0, provider = '', friendly = true } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.provider = provider;
      this.friendly = friendly;
    }
  }

  function friendlyError(status, provider) {
    const label = (PROVIDERS[provider] && PROVIDERS[provider].label) || provider;
    if (status === 401 || status === 403) return 'Invalid or unauthorized ' + label + ' API key. Check it in Prism settings.';
    if (status === 429) return 'Rate limit hit on ' + label + '. Wait a moment and try again.';
    if (status === 404) return 'Model not found on ' + label + '. Check the model name in settings.';
    if (status >= 500) return label + ' server error — try again shortly.';
    if (status === 400) return label + ' rejected the request. Check model name and settings.';
    return 'Network error, please try again.';
  }

  // ---------------------------------------------------------- cache

  async function hashString(s) {
    if (root.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return 'h' + h;
  }

  async function readCache(key, ttlMinutes) {
    if (!root.CoachStorage || !root.CoachStorage.KEYS) return null;
    try {
      const store = await new Promise((resolve) => {
        const area = chrome.storage.local;
        area.get(root.CoachStorage.KEYS.apiCache, (res) => resolve((res && res[root.CoachStorage.KEYS.apiCache]) || {}));
      });
      const hit = store[key];
      if (!hit) return null;
      if (Date.now() - hit.ts > ttlMinutes * 60000) return null;
      return hit.value;
    } catch (_) {
      return null;
    }
  }

  async function writeCache(key, value) {
    if (!root.CoachStorage || !root.CoachStorage.KEYS) return;
    try {
      const area = chrome.storage.local;
      area.get(root.CoachStorage.KEYS.apiCache, (res) => {
        const store = (res && res[root.CoachStorage.KEYS.apiCache]) || {};
        store[key] = { ts: Date.now(), value };
        const entries = Object.entries(store).sort((a, b) => b[1].ts - a[1].ts).slice(0, 100);
        area.set({ [root.CoachStorage.KEYS.apiCache]: Object.fromEntries(entries) });
      });
    } catch (_) { /* cache is best-effort */ }
  }

  // ----------------------------------------------------------- call

  /**
   * @param {object} opts { prompt, analysis, context, settings, apiKey, provider, model }
   * @returns {Promise<{text: string, cached: boolean, provider: string, model: string}>}
   */
  async function callLlm(opts) {
    const settings = opts.settings || {};
    const provider = opts.provider || settings.provider || 'openai';
    const spec = PROVIDERS[provider];
    if (!spec) throw new ApiError('Unknown provider: ' + provider, { provider });

    const model = opts.model || (settings.models && settings.models[provider]) || spec.defaultModel;
    const baseUrl = provider === 'ollama' ? settings.ollamaUrl : undefined;

    let apiKey = opts.apiKey;
    if (apiKey === undefined) {
      apiKey = provider === 'ollama' ? 'local' : ((settings.apiKeys && settings.apiKeys[provider]) || '');
    }
    if (provider !== 'ollama' && !apiKey) {
      throw new ApiError('No API key configured for ' + spec.label + '. Add one in Prism settings.', { provider });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(opts.prompt, opts.analysis, opts.context) }
    ];

    // Cache lookup (skipped for local Ollama — cheap anyway).
    const ttl = (settings.behavior && settings.behavior.cacheTtlMinutes) || 30;
    const cacheKey = await hashString(provider + '|' + model + '|' + messages[1].content);
    const cached = await readCache(cacheKey, ttl);
    if (cached) return { text: cached, cached: true, provider, model };

    const built = spec.build(model, messages, baseUrl);
    let res;
    try {
      res = await fetch(built.url, {
        method: 'POST',
        headers: built.headers(apiKey),
        body: built.body()
      });
    } catch (e) {
      if (provider === 'ollama') {
        throw new ApiError('Could not reach Ollama at ' + (baseUrl || 'http://localhost:11434') + '. Is it running? (Start it, then run: OLLAMA_ORIGINS="chrome-extension://*" ollama serve)', { provider });
      }
      throw new ApiError(friendlyError(0, provider), { provider });
    }

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
      throw new ApiError(friendlyError(res.status, provider), { status: res.status, provider });
    }

    let data;
    try { data = await res.json(); } catch (_) {
      throw new ApiError(friendlyError(res.status || 0, provider), { provider });
    }

    const text = built.extract(data);
    if (!text) throw new ApiError('Got an empty response from ' + spec.label + '.', { provider });
    writeCache(cacheKey, text);
    return { text: text.trim(), cached: false, provider, model };
  }

  const CoachApi = { PROVIDERS, callLlm, ApiError, SYSTEM_PROMPT };
  root.CoachApi = CoachApi;
  if (typeof self !== 'undefined' && self !== root) self.CoachApi = CoachApi;
})(typeof globalThis !== 'undefined' ? globalThis : self);
