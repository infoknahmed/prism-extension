/**
 * Prism — store screenshot generator (Puppeteer).
 *
 * Captures four 1280x800 screenshots for the Edge Add-ons / Chrome Web Store
 * listings into submission/screenshots/:
 *   1-fab.png            — the floating Prism button over a ChatGPT-like page
 *   2-analysis-panel.png — the result panel (scores + optimized prompt)
 *   3-templates.png      — the template library
 *   4-options.png        — the options page
 *
 * How it works:
 * - The shipped content script only injects on real AI chat hosts, so this
 *   script writes a screenshot-only COPY of the extension into .tmp-shot-ext/
 *   whose manifest additionally matches http://localhost:8902/* (the mocked
 *   ChatGPT page served from tests/dummy-chat.html). dist/ is never touched.
 * - The COACH message route is answered by a stub background (offline mode),
 *   so the panel renders realistic analysis without network access.
 * - Uses the Puppeteer-managed Chrome when present, else system Chrome.
 *
 * Usage: node scripts/generate-screenshots.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'submission', 'screenshots');
const TMP_EXT = path.join(ROOT, '.tmp-shot-ext');
const PORT = 8902;
const WIDTH = 1280;
const HEIGHT = 800;

// ------------------------------------------------------------------ server

/** Minimal static server for the dummy chat page (keeps an http:// origin). */
function startServer() {
  const pageHtml = fs.readFileSync(path.join(ROOT, 'tests', 'dummy-chat.html'), 'utf8');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHtml);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// ------------------------------------------------- screenshot-only ext copy

/** Copy dist/ and widen the content-script matches to include localhost.
 *  A fixed manifest "key" (public half of prism-key.pem) pins the extension
 *  ID deterministically, so the options page URL is knowable up front. */
function buildScreenshotExt() {
  fs.rmSync(TMP_EXT, { recursive: true, force: true });
  fs.mkdirSync(TMP_EXT, { recursive: true });
  copyDir(DIST, TMP_EXT);
  const manifest = JSON.parse(fs.readFileSync(path.join(TMP_EXT, 'manifest.json'), 'utf8'));
  manifest.content_scripts[0].matches.push('http://localhost:' + PORT + '/*', 'http://127.0.0.1:' + PORT + '/*');
  const pem = fs.readFileSync(path.join(ROOT, 'prism-key.pem'), 'utf8');
  manifest.key = crypto.createPublicKey({ key: pem, format: 'pem' }).export({ format: 'der', type: 'spki' }).toString('base64');
  fs.writeFileSync(path.join(TMP_EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Stub background: answer COACH offline so the panel renders deterministic,
  // presentation-worthy analysis with zero network dependency.
  const stub = `'use strict';
importScripts('utils/browserPolyfill.js', 'utils/storage.js', 'utils/promptAnalyzer.js', 'utils/templateManager.js');
const ANALYSIS = {
  goal: 'generate', tone: 'casual', complexity: 'medium',
  vagueWords: 3, estimatedTokens: 9,
  safety: { flags: [] },
  scores: { clarity: 42, specificity: 28, context: 30, constraints: 25, overall: 34 }
};
const OPTIMIZED = 'You are a skilled creative writing assistant.\\n\\n' +
  'Task: Write a short, imaginative piece (2-3 paragraphs) on a topic of your choice.\\n' +
  'Aim for vivid imagery, a consistent tone, and a satisfying closing line.\\n\\n' +
  'Constraints: no lists, keep it under 250 words, end with a single-sentence takeaway.';
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return undefined;
  if (msg.type === 'COACH') {
    sendResponse({ ok: true, mode: 'offline', analysis: ANALYSIS, optimized: OPTIMIZED, notes: [
      { type: 'learn', text: 'You work on "generate" tasks often — this shape is based on your history.' }
    ], provider: 'offline', model: null });
    return true;
  }
  if (msg.type === 'GET_TEMPLATES') {
    CoachTemplateManager.getAllTemplates()
      .then((t) => sendResponse({ ok: true, templates: t }))
      .catch(() => sendResponse({ ok: true, templates: [] }));
    return true; // respond asynchronously
  }
  return undefined;
});`;
  fs.writeFileSync(path.join(TMP_EXT, 'background.js'), stub);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ------------------------------------------------------------------ helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFab(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const el = document.getElementById('prism-fab');
    return !!el && el.getBoundingClientRect().width > 0;
  }, { timeout });
}

async function shot(page, file) {
  await page.screenshot({ path: path.join(OUT, file) });
  console.log('📸 ' + file);
}

/** The panel lives in a shadow root attached to #prism-host. */
async function panelSel(page, selector) {
  await page.waitForFunction((sel) => {
    const host = document.getElementById('prism-host');
    if (!host || !host.shadowRoot) return false;
    return !!host.shadowRoot.querySelector(sel);
  }, { timeout: 15000 }, selector);
  await sleep(500); // let transitions settle
}

async function clickInPanel(page, selector) {
  await page.evaluate((sel) => {
    const host = document.getElementById('prism-host');
    host.shadowRoot.querySelector(sel).click();
  }, selector);
}

async function typePrompt(page) {
  await page.click('#prompt-textarea');
  await page.type('#prompt-textarea', 'write something good about stuff', { delay: 15 });
}

// --------------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  buildScreenshotExt();
  const server = await startServer();

  const cacheDir = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'puppeteer', 'chrome');
  let executablePath;
  try {
    const builds = fs.readdirSync(cacheDir).sort().reverse();
    for (const b of builds) {
      const inner = path.join(cacheDir, b, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(inner)) { executablePath = inner; break; }
    }
  } catch (_) { /* fall through to system chrome */ }
  if (!executablePath) {
    const candidates = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ].filter(Boolean);
    executablePath = candidates.find((p) => fs.existsSync(p));
  }
  if (!executablePath) throw new Error('No Chrome found for Puppeteer');
  console.log('Using Chrome: ' + executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    width: WIDTH + 20,
    height: HEIGHT + 120,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions-except=' + TMP_EXT,
      '--load-extension=' + TMP_EXT,
      '--window-size=' + (WIDTH + 20) + ',' + (HEIGHT + 120),
      '--disable-features=ExtensionsToolbarMenu'
    ]
  });

  try {
    const [page] = await browser.pages();
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle2' });
    await waitFab(page);
    await sleep(1200); // allow fab positioning + observers to settle

    // ---- 1: floating button
    await shot(page, '1-fab.png');

    // ---- seed the input, then open the panel via the FAB
    await typePrompt(page);
    await sleep(400);
    await page.click('#prism-fab');
    await panelSel(page, '.panel');
    await sleep(2500); // offline coach round-trip + result render

    // ---- 2: analysis panel (scores + optimized)
    await shot(page, '2-analysis-panel.png');

    // ---- 3: template library
    await clickInPanel(page, '[data-x="templates"]');
    await panelSel(page, '.tpl-list');
    await sleep(800);
    await shot(page, '3-templates.png');

    // ---- 4: options page (real options.html from the extension).
    // The fixed manifest key pins the ID to the same value as the signed CRX.
    const pem = fs.readFileSync(path.join(ROOT, 'prism-key.pem'), 'utf8');
    const pubDer = crypto.createPublicKey({ key: pem, format: 'pem' }).export({ format: 'der', type: 'spki' });
    const hash = crypto.createHash('sha256').update(pubDer).digest();
    const extId = Array.from(hash.subarray(0, 16)).map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0xf))).join('');
    const opt = await browser.newPage();
    await opt.setViewport({ width: WIDTH, height: HEIGHT });
    await opt.goto('chrome-extension://' + extId + '/options/options.html', { waitUntil: 'networkidle2' });
    await sleep(1000);
    await opt.screenshot({ path: path.join(OUT, '4-options.png') });
    console.log('📸 4-options.png');
    await opt.close();
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(TMP_EXT, { recursive: true, force: true });
  }
  console.log('Screenshots generated into submission/screenshots/');
}

main().catch((e) => { console.error(e); process.exit(1); });
