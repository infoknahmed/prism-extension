# Microsoft Edge Add-ons — Submission Guide for Prism

This guide walks you through publishing **Prism v1.1.0** to the Microsoft Edge Add-ons store. Registration is **free** — unlike the Chrome Web Store, there is no developer fee.

**Package to upload:** `dist/prism-v1.1.0.zip` (the same package used for the Chrome Web Store; Edge accepts Chromium MV3 packages as-is)

---

## Step 1 — Register on Partner Center

1. Go to **https://partner.microsoft.com/dashboard/microsoftedge/**
2. Sign in with a Microsoft account (personal or work — a free Outlook.com account works).
3. Complete the one-time developer registration (free):
   - Choose **Individual** (or Company if you have a registered business).
   - Fill in publisher name, email, and contact details.
   - Accept the Microsoft Edge Developer Agreement.

## Step 2 — Create the extension

1. In Partner Center: **Home → Workspaces → Edge card → Create new extension**.
2. If prompted, create a new developer **workspace** first (just a container for your products).

## Step 3 — Upload the package

1. On the **Packages** tab, upload `dist/prism-v1.1.0.zip`.
2. Wait for validation. It should pass automatically (valid MV3 manifest, correct icons 16/48/128).

## Step 4 — Store listing (fill in exactly this)

| Field | Value |
|---|---|
| **Name** | Prism |
| **Short description** | Refract your prompts into clarity. Prism analyzes and optimizes your AI prompts for better results. |
| **Detailed description** | *Paste the Chrome Web Store listing text (see README features list or write a summary of: smart local prompt analysis, one-click optimization with side-by-side comparison, 10+ built-in and custom templates with {placeholder} support, history & favorites, adaptive learning, multi-model cloud AI — OpenAI, Anthropic, Gemini, OpenRouter, Ollama — and a privacy-first rule-based engine that runs entirely on-device.)* |
| **Category** | Productivity |
| **Privacy Policy URL** | https://infoknahmed.github.io/prism-extension/privacy.html |
| **Store logo** | `icons/icon128.png` (in-package; upload manually if asked, 128×128) |
| **Search terms** | prism, prompt, ai, chatgpt, claude, gemini, writing |

## Step 5 — Permissions justification

Enter these in the **Justifications** / notes for each permission:

- **storage** — Save user settings, coaching history, custom templates, and AES-GCM-encrypted API keys locally on the device.
- **activeTab** — Read the prompt the user is typing on the current AI chat tab when they invoke Prism.
- **scripting** — Inject the Prism panel and floating button into supported AI chat pages (ChatGPT, Claude, Gemini, DeepSeek, Perplexity) so the extension can function.
- **clipboardWrite** — Copy the optimized prompt to the clipboard when the user clicks Copy.
- **contextMenus / commands** — Right-click "Prism: improve selection" and the Ctrl+Shift+E keyboard shortcut. *(If listed.)*

Also state (this matches the published privacy policy):
- No analytics, no tracking, no remote code.
- Prompt analysis always runs locally; prompt text only leaves the device when the user explicitly opts into cloud AI with their own API key.

## Step 6 — Website / support

| Field | Value |
|---|---|
| **Website** | https://github.com/infoknahmed/prism-extension |
| **Support email / contact** | support@prism-extension.dev |

## Step 7 — Submit

1. Click **Publish**. Review typically takes **1–3 business days**.
2. After approval, the listing appears at `https://microsoftedge.microsoft.com/addons/detail/<extension-id>`.

---

## Reference: extension identity

| Item | Value |
|---|---|
| Version | 1.1.0 |
| Manifest | MV3 (Edge-compatible; `manifest.edge.json` in the repo = `manifest.json` minus `minimum_chrome_version`) |
| Edge minimum | Edge 113+ recommended (matches Chromium 100+ baseline; test in Edge before submitting) |

## Updating later

1. Bump `version` in `manifest.json` (and `manifest.edge.json`).
2. `npm run pack` → new `dist/prism-v<version>.zip`.
3. Partner Center → your extension → **Update** → upload the new zip.
