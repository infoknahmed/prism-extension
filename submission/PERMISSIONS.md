# Prism — Permissions Justification (Edge Add-ons)

Paste each justification into Partner Center's permission notes.

---

| Permission | Justification |
|---|---|
| **storage** | Save user settings, coaching history, favorites, custom templates, and API keys (encrypted with AES-GCM before storage) locally on the user's device via chrome.storage.local. |
| **activeTab** | Read the prompt text the user is typing in the current AI chat tab, but only when the user explicitly invokes Prism (button click, context menu, or keyboard shortcut). |
| **scripting** | Inject Prism's floating button and panel UI into supported AI chat websites (ChatGPT, Claude, Gemini, DeepSeek, Perplexity) so the extension can read and optimize the user's prompt in place. |
| **clipboardWrite** | Copy the optimized prompt to the clipboard when the user clicks "Copy optimized". |
| **contextMenus** | Provide the right-click action "Prism: improve selection" on selected text on AI chat pages. |
| **commands** | Register the Ctrl+Shift+E keyboard shortcut that invokes Prism on the current page. |

## Host permissions

| Host | Justification |
|---|---|
| api.openai.com / api.anthropic.com / generativelanguage.googleapis.com / openrouter.ai | Called directly from the user's browser with the user's own API key, and only when the user has opted into cloud AI and explicitly selected that provider. Prism operates no servers. |
| localhost:11434 | Optional connection to a user-installed local Ollama instance for offline AI coaching. |

## Data use disclosures (confirm these in Partner Center)

- Prism does **not** collect, transmit, or store personal data on its own. No analytics, no tracking, no telemetry.
- All prompt analysis runs locally on the device by default.
- Prompt text leaves the device **only** when the user explicitly enables cloud AI, and only to the user-chosen provider, for the single purpose of rewriting the prompt.
- API keys are AES-GCM encrypted before storage and are never exported in backups.
- Privacy policy: https://infoknahmed.github.io/prism-extension/privacy.html
