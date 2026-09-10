#!/usr/bin/env bash
# Prism — build + package (Linux/macOS/Git Bash)
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Installing dev dependencies (esbuild)…"
npm install --no-audit --no-fund

echo "==> Generating icons…"
npm run --silent icons

echo "==> Building dist/…"
npm run --silent build

echo "==> Running self-diagnostics…"
npm run --silent test

echo "==> Packaging zip…"
node scripts/pack.js

echo "Done. dist/prism-v*.zip is ready for the Chrome Web Store."
