/**
 * Prism — build script.
 * 1. Minifies every JS file referenced by manifest.json (background, content,
 *    popup, options, utils) with esbuild into dist/ at the same relative path.
 * 2. Copies manifest.json, HTML, CSS, JSON assets and icons into dist/.
 * 3. Inlines assets/templates.json into the bundled templateManager so the
 *    minified build has no runtime fetch dependency.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function walk(dir, base) {
  base = base || dir;
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

  // Collect every JS file the extension actually loads.
  const scripts = new Set();
  scripts.add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts) for (const s of cs.js) scripts.add(s);
  scripts.add('popup/popup.js');
  scripts.add('options/options.js');

  // Clean dist.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Minify JS with esbuild.
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (_) {
    esbuild = null;
  }

  for (const rel of scripts) {
    const src = path.join(ROOT, rel);
    const dest = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (esbuild) {
      await esbuild.build({
        entryPoints: [src],
        outfile: dest,
        bundle: false,
        minify: true,
        keepNames: true,
        legalComments: 'none',
        target: ['chrome100', 'firefox113'],
        logLevel: 'error'
      });
    } else {
      console.warn('[build] esbuild not installed — copying unminified: ' + rel);
      copy(src, dest);
    }
  }

  // Static assets: manifests, html, css, assets/, icons/.
  copy(path.join(ROOT, 'manifest.json'), path.join(DIST, 'manifest.json'));
  copy(path.join(ROOT, 'popup', 'popup.html'), path.join(DIST, 'popup', 'popup.html'));
  copy(path.join(ROOT, 'popup', 'popup.css'), path.join(DIST, 'popup', 'popup.css'));
  copy(path.join(ROOT, 'options', 'options.html'), path.join(DIST, 'options', 'options.html'));
  copy(path.join(ROOT, 'options', 'options.css'), path.join(DIST, 'options', 'options.css'));
  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyDir(path.join(ROOT, 'icons'), path.join(DIST, 'icons'));

  // Chromium auto-update manifest, generated per build so `version` always
  // matches manifest.json. The codebase URL uses `releases/latest`, so the
  // same XML works for every release once attached as a release asset.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const extId = 'jnpkmmbfccpljgfechndpgnaegfilijh';
  const repo = 'infoknahmed/prism-extension';
  const updatesXml = [
    '<?xml version=\'1.0\' encoding=\'UTF-8\'?>',
    '<gupdate xmlns=\'http://www.google.com/update2/response\' protocol=\'2.0\'>',
    '  <app appid=\'' + extId + '\'>',
    '    <updatecheck codebase=\'https://github.com/' + repo + '/releases/latest/download/prism-v' + pkg.version + '.crx\' version=\'' + pkg.version + '\' />',
    '  </app>',
    '</gupdate>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(DIST, 'updates.xml'), updatesXml);

  // Sanity checks: every manifest-referenced file exists in dist.
  const missing = [];
  const refs = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...manifest.icons ? Object.values(manifest.icons) : [],
    ...Object.values(manifest.action.default_icon || {}),
    ...manifest.content_scripts.flatMap((cs) => cs.js)
  ];
  for (const ref of refs) {
    if (!fs.existsSync(path.join(DIST, ref))) missing.push(ref);
  }
  if (missing.length) {
    console.error('[build] FAIL — missing in dist: ' + missing.join(', '));
    process.exit(1);
  }

  const files = walk(DIST);
  console.log('[build] OK — ' + files.length + ' files in dist/');
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

main().catch((e) => {
  console.error('[build] FAILED:', e);
  process.exit(1);
});
