# Prism — Edge Add-ons Submission Checklist

Package version: **v1.1.0** · Manifest: MV3 · Extension ID (CRX): `jnpkmmbfccpljgfechndpgnaegfilijh`

## Prepared (automated)

- [x] Extension built and packaged → `submission/prism-v1.1.0.zip` (Manifest V3, `manifest.json` at zip root, icons 16/48/128)
- [x] Edge manifest variant verified → `submission/manifest.edge.json` (no `minimum_chrome_version`, no `update_url`)
- [x] Edge manifest validation passed (MV3, name/version/description, 128px icon, action, service worker)
- [x] Screenshots generated (4 files, 1280×800) → `submission/screenshots/`
- [x] Privacy policy live → https://infoknahmed.github.io/prism-extension/privacy.html
- [x] Store listing text ready → `submission/STORE_LISTING.md`
- [x] Permissions justifications ready → `submission/PERMISSIONS.md`
- [x] CI green on main; tests 67/67 passing
- [x] GitHub Release with signed CRX + auto-update manifest published

## Your manual steps

- [ ] Register at https://partner.microsoft.com/dashboard/microsoftedge/ (free, no developer fee)
- [ ] Create new extension (Home → Workspaces → Edge card → Create new extension)
- [ ] Upload `submission/prism-v1.1.0.zip`
- [ ] Upload all 4 screenshots from `submission/screenshots/` (1280×800)
- [ ] Paste store listing text from `submission/STORE_LISTING.md`
- [ ] Paste permissions justifications from `submission/PERMISSIONS.md`
- [ ] Set Privacy Policy URL → https://infoknahmed.github.io/prism-extension/privacy.html
- [ ] Set Website → https://github.com/infoknahmed/prism-extension
- [ ] Set Support → https://github.com/infoknahmed/prism-extension/issues
- [ ] Submit for review (typically 1–3 business days)

## After approval

- Listing appears at `https://microsoftedge.microsoft.com/addons/detail/<extension-id>`
- To update: bump version in `manifest.json` → `npm run pack` → Partner Center → Update → upload new zip (or tag `vX.Y.Z` and let CI build everything)
