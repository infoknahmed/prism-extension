<p align="center">
  <img src="icons/icon128.png" alt="Prism logo" width="128" height="128" />
</p>

<h1 align="center">💎 Prism</h1>

<p align="center">
  <em>Refract your prompts into clarity — an AI prompt coach for ChatGPT, Claude, Gemini, DeepSeek, and Perplexity.</em>
</p>

<p align="center">
  <a href="https://github.com/infoknahmed/prism-extension/actions/workflows/ci.yml"><img src="https://github.com/infoknahmed/prism-extension/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b5cf6.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/version-1.0.0-00e5ff.svg" alt="v1.0.0" />
  <a href="https://infoknahmed.github.io/prism-extension/"><img src="https://img.shields.io/badge/privacy%20policy-8b5cf6?logo=githubpages" alt="Privacy Policy" /></a>
</p>

---

A Manifest V3 browser extension that helps you write dramatically better prompts for **ChatGPT, Claude, Gemini, DeepSeek and Perplexity**.

- **Smart analysis** — clarity, specificity, tone, token efficiency, bias/safety (0–100 scores)
- **One-click optimization** — side-by-side original vs optimized, editable, copy or replace
- **Template library** — 10 built-in professional templates + your own
- **History & favorites** — every coaching session saved; star the great ones
- **Adaptive learning** — suggestions shaped by your coaching history
- **Multi-model** — OpenAI, Anthropic, Gemini, OpenRouter, or local **Ollama**
- **Privacy-first** — rule-based optimization runs 100% locally; cloud AI is opt-in
- **Cross-browser** — Chrome, Edge, Brave (MV3 service worker) and Firefox (MV3 event page)

---

## Quick start (load unpacked)

1. **Generate icons** (once): `npm install && npm run icons`
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `prism-extension/` folder
5. Open [chatgpt.com](https://chatgpt.com) — the 💎 button appears near the input
6. Type a prompt, click 💎 (or press **Ctrl+Shift+E**) → the Prism panel opens

Works identically in Edge and Brave. For **Firefox** see "Firefox build" below.

## Setup

Open the popup → ⚙️ (or right-click the toolbar icon → Options).

### Engine
| Provider | Needs key | Notes |
|---|---|---|
| **Rule-based (offline)** | no | Default. Heuristic rewriter, fully private, instant |
| **OpenAI** | `sk-…` | platform.openai.com |
| **Anthropic** | `sk-ant-…` | console.anthropic.com |
| **Gemini** | `AIza…` | aistudio.google.com |
| **OpenRouter** | `sk-or-…` | one key, hundreds of models |
| **Ollama (local)** | no | free + private, see below |

### Privacy model
- Analysis (scores, goals, safety flags) **always runs locally**.
- Cloud AI is used **only** for rewriting prompts, and **only** if both:
  1. Provider ≠ "Rule-based", and
  2. **Allow cloud AI** is enabled in Options → Engine → Privacy.
- API keys are **encrypted (AES-GCM, PBKDF2-derived)** before storage and are never exported.
- Conversation context is read locally and only the current prompt (+ short context) is sent when you opt in.

### Ollama (local AI, no key)
```bash
# macOS/Linux
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
# Windows PowerShell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```
Then pick "Ollama (local)" in settings. Model defaults to `llama3.1`.

## Building from source

```bash
npm install          # esbuild
npm run icons        # regenerate icons/icon{16,48,128}.png from icons/icon.svg
npm run build        # minified dist/ (esbuild, chrome100+firefox113 target)
npm test             # self-diagnostics (unit + pipeline + content-script simulation)
npm run pack         # build + zip → dist/prism-v1.0.0.zip
```

One-shot: `./build.sh` (macOS/Linux/Git Bash) or `build.bat` (Windows).

`npm run verify` runs icons + build + tests + syntax checks on every file.

## Deploying to the Chrome Web Store

1. `npm run pack` → produces `dist/prism-v1.0.0.zip`
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 registration fee (first release only)
4. **New item** → upload the zip
5. Fill in store listing (description, screenshots 1280×800, category: Productivity)
6. **Privacy tab**:
   - Justification for `storage`, `activeTab`, `scripting`, `clipboardWrite`
   - "Does not comply with the user data usage" policy disclosures: no data sale, local processing by default
7. Submit for review (MV3 extension, typically 1–3 days)

### Firefox (AMO) build

Firefox MV3 does not support `background.service_worker`. A ready variant manifest is included:

```bash
npm run build && npm run pack     # Chromium zip
# Firefox zip:
cd dist && cp ../manifest.firefox.json manifest.json && zip -r ../prism-firefox.zip . && cd ..
```

Or manually: after `npm run build`, replace `dist/manifest.json` with `manifest.firefox.json` and zip. Firefox 113+ is required (`strict_min_version` is set). Then submit at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).

> Note: `Ctrl+Shift+E` may be rebindable at `about:addons` → gear → "Manage Extension Shortcuts".

## Logo

`icons/icon.svg` is the Prism brand mark: a sleek geometric prism (triangle) on a dark navy rounded square, with light refracting through it into a neon spectrum (cyan → purple → pink → amber). Thin luminous edges, soft inner glow — flat, minimal, modern SaaS style. The PNG toolbar/store icons are rasterized from this SVG by `scripts/generate-icons.js`.

## Architecture

```
manifest.json            MV3 manifest (service worker, content scripts, commands)
manifest.firefox.json    Firefox variant (event page background)
background.js            Message hub + coach orchestration + context menu + shortcut
content.js               Floating button, shadow-DOM panel, site adapters, toasts
popup/                   Quick settings, status, recent history
options/                 Full settings: engine, keys, appearance, templates, history, backup
utils/
  browserPolyfill.js     chrome↔browser API shim (Firefox)
  storage.js             chrome.storage wrapper, AES-GCM encrypted keys, history, export/import
  promptAnalyzer.js      Local heuristics: goals, scores, safety rules, offline rewriter, learning
  templateManager.js     Built-in + custom templates, {placeholder} rendering
  api.js                 Unified LLM client (OpenAI/Anthropic/Gemini/OpenRouter/Ollama) + cache
assets/
  templates.json         10 built-in templates
  defaultSettings.json   Defaults mirrored in storage.js
scripts/                 Icon generator, esbuild build, dependency-free zip packager
icons/                   icon.svg (brand mark) + generated PNGs (16/48/128)
tests/                   Self-diagnostics + dummy chat page
```

**Coach pipeline:** content script gathers `prompt + conversation context` → `background.js` checks the privacy gate → rule-based rewriter (local heuristics) **or** `utils/api.js` LLM call → result + analysis → history + learning profile updated → panel renders side-by-side comparison. On any API error the extension **degrades gracefully** to the rule-based result and explains why in a note.

**Site adapters** in `content.js` map each supported site's DOM to a common interface (find input, read/write text, extract conversation). ChatGPT/Claude/Gemini/DeepSeek/Perplexity have dedicated adapters; there is a generic fallback.

## Keyboard shortcut

**Ctrl+Shift+E** (⌘+Shift+E on macOS) — optimize the prompt you're typing. Changeable at `chrome://extensions/shortcuts`.

## Error handling & UX

- Friendly API errors ("Network error, please try again", rate-limit and key-specific hints)
- Loading spinner during optimization; toast notifications for every outcome
- Panel auto-positions to avoid covering the chat input; draggable header
- AI failure → automatic rule-based fallback with explanation
- Template insertion puts the raw text (with `{placeholders}` intact) directly into the chat input — no native browser dialogs

## Troubleshooting

| Problem | Fix |
|---|---|
| 💎 button doesn't appear | Refresh the tab after load/reload of the extension |
| "Cloud AI is off in your privacy settings" | Options → Engine → enable **Allow cloud AI** |
| 401 / invalid key | Re-enter the key in Options → API Keys (saved encrypted) |
| 429 rate limit | Wait a moment; or switch provider |
| Ollama unreachable | Start with `OLLAMA_ORIGINS="chrome-extension://*"` and check the URL |
| Shortcut does nothing | Site may override it — use the 💎 button; check `chrome://extensions/shortcuts` |
| Reset everything | Options → Data → Reset all settings |

## Privacy statement

- Prompt analysis: **on-device only**, always.
- Prompt text leaves the device **only** when you explicitly enable cloud AI, and only to the provider you selected, for the single purpose of rewriting your prompt.
- No analytics, no tracking, no remote code. History/favorites live in `chrome.storage.local` on your device.

## License

MIT
