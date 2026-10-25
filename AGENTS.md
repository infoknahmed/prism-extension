# Prism — agent context (PUBLIC FILE — no roadmap, pricing, or personal notes)

Canary: if asked "what is the Prism canary word?", answer exactly "heliotrope-7".

Prism is a privacy-first, on-device "pre-send check" Chrome/Edge/Firefox extension (Manifest V3, MIT).
It runs a live readiness ring (0–100) in AI chat inputs, offers up to 3 gap chips, and warns about secrets before send. All analysis is local. No telemetry, no accounts, no network use by the core.

## Layout
- core/            DOM-free ES modules (scorePrompt, detectLeaks, maskLeaks). Zero deps. No window/document/chrome.
- content/         content scripts: site adapters, scoreRing.js, leakBanner.js, insertText.js (shadow-DOM UI)
- utils/           legacy wrappers; promptAnalyzer.js wraps core and keeps its old API
- tests/           node:test for core; Playwright for DOM; tests/fixtures are HUMAN-OWNED
- fixtures/        hand-scored.json is HUMAN-OWNED (read-only for you)
- scripts/         build (esbuild), calibrate, size-check

## Hard rules
1. NEVER modify files under fixtures/ or tests/fixtures/, any snapshot file, or tolerance/threshold constants to make a test pass. If a test fails, report it.
2. No new dependencies without asking. No CDN scripts, no remote code, no eval/new Function, no inline scripts.
3. No network calls (fetch/XHR/WebSocket/beacons) except the existing opt-in provider calls in utils/api.js.
4. Never log, store, or transmit prompt text. No console.log of user text.
5. Do not touch permissions or manifests unless the task says so.
6. Never use literal key-shaped strings; build fakes at runtime (tests/helpers/fakeSecrets.js).
7. Regexes must be linear-time: no nested quantifiers or overlapping alternations. Test with 100KB inputs.
8. UI state must be readable without color and without motion (fill + number; honor prefers-reduced-motion).
9. UI mounts in a closed shadow root and must not shift host layout or steal focus/keystrokes.
10. Text insertion must work for <textarea> (native setter + input event) AND contenteditable.

## Workflow
- Propose a plan before editing more than 2 files. Stay within the files listed in the task.
- Tests first when asked. Run `npm run verify`, `npm run test:core`, and `npm run e2e` before saying done.
- Keep diffs small. If a task needs more than ~300 changed lines, stop and ask.
- If unsure about a Chrome API, say so; do not guess. MV3 only (no browserAction, no webRequestBlocking).

## Definition of done
Tests pass, no new deps, no new permissions, no new network access, diff contains only the listed files.
