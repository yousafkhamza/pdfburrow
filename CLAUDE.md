# pdfburrow: project context

Read this before exploring the code. It is meant to save re-reading the whole repo.

## What it is
Free PDF tools that run 100% in the browser. Files are never uploaded. Static site on GitHub Pages (`https://yousafkhamza.github.io/pdfburrow/`), English only, global audience, monetised later with AdSense. Sibling project: `../gulfcalc`. Author: Yousaf K Hamza. **No AI/Claude credit anywhere in the repo, site or docs.** The user commits and pushes themselves.

## Status (2026-11-25)
Fully written and **never executed locally**: Node is blocked on this laptop (company Defender policy), so don't try to install it or work around that. CI is the only place code runs. The first CI runs will surface bugs; fix them from the logs the user pastes. Riskiest parts: the qpdf ESM wrapper (protect/unlock), Tesseract `pdf: true` output (searchable PDF), the compress-to-100 KB e2e test, and heic2any under the CSP (no HEIC fixture, so untested).

## Tools (17), ids → URL slug
merge→merge-pdf, split→split-pdf, compress→compress-pdf (+ /100kb /200kb /300kb /500kb /1mb /2mb), organize→organize-pdf, crop→crop-pdf, images-to-pdf→jpg-to-pdf, pdf-to-images→pdf-to-jpg, pdf-to-text→pdf-to-text (OCR + searchable PDF), sign→sign-pdf, fill-form→fill-pdf-form, page-numbers→add-page-numbers-to-pdf, watermark→add-watermark-to-pdf, protect→protect-pdf, unlock→unlock-pdf, redact→redact-pdf, remove-metadata→remove-pdf-metadata, id-scan→id-card-to-pdf.

## Where things are
| Path | Purpose |
|---|---|
| `src/app/tools/meta.js` | **Tool definitions**: name, accepted files, option fields (select/number/text/password/checkbox, `showIf`, `group:'more'`), button label, `SLUGS`, `NEXT` (chain to next tool), `readOptions()`. Shared by build and browser. |
| `src/app/tools/<id>.js` | Tool behaviour: `run(ctx)` returns `{title, summary, files:[{name,blob}], notes, text?, sizes?, zipName?}`; optional `setup/onFiles/onOptions/onClear/onCancel/ready(ctx)` (ready returns true or a hint message). `common.js` has helpers; `qpdf.js` runs qpdf. |
| `src/app/runtime.js` | Tool page controller: file intake (picker/drop/paste/handoff), file list with reorder, options and showIf, Run button state and hints, progress/cancel, friendly errors, result panel (download, zip, copy text, next-tool chips). |
| `src/app/pdf-ops.js` | All pdf-lib operations as pure functions `op(lib, …)`, with `lib` injected (vendored in the worker, npm in tests). Includes `collectGarbage` (deletes unreachable objects: essential for redaction and metadata removal). |
| `src/app/worker.js` / `engine.js` | Module worker running pdf-ops; `engine.run(op, args, transfer)`, `engine.cancel()`. Always pass **copies** of bytes (`.slice()`), because transfer detaches them. |
| `src/app/render.js` | pdf.js on the main thread: `openPdf` (codes `encrypted`, `wrong-password`, `invalid-pdf`), `renderPage`, `pageText`, `textBoxes`. |
| `src/app/files.js` | `describe` (sniff type), `bytesOf`, `pdfOf`, `inspect` (page count, locked flag), `imageForPdf` (EXIF rotation, HEIC, webp/gif to png). |
| `src/app/io.js` | `saveBlob`, `zip` (fflate), IndexedDB handoff between tools, upload guard (wraps fetch/XHR/beacon and counts file bytes sent; the UI shows "0 bytes"). |
| `src/app/libs.js` | Lazy loaders for the vendored libs (`assets/vendor/…`). |
| `src/app/core/*` | Pure, unit-tested logic: `ranges`, `layout` (display↔user space for /Rotate, positions, crop boxes, ID card layout), `compress-plan` (keep-text levels then page-raster levels; `choose`), `format`, `sniff`, `image-info`. |
| `src/content/tools.js`, `guides.js`, `static.js` | SEO copy: titles (≤70 characters with " \| pdfburrow"), descriptions (80 to 165), steps, FAQ, related tools, categories, size pages. |
| `src/templates.js` | HTML: head (CSP, theme hash, JSON-LD), tool app markup (ids the runtime expects), home, guides, static pages, 404. |
| `src/assets/styles.css` | Design tokens (paper white, blue `#2F5BEA`, yellow highlight `#F5C518`), dark mode, every component. |
| `build.mjs` | Copies app and vendored libs (from node_modules; qpdf wrapped as ESM), writes `VERSIONS.json` checksums, pages, sitemap, robots, manifest, `sw.js`, `ads.txt`. |
| `scripts/check.mjs` | Post-build gate: links, SEO tags, CSP hash, ids and labels, tool form vs meta, script syntax and imports, vendor checksums, sitemap, service worker. |
| `scripts/serve.mjs` | Static server for e2e and preview (port 4173). |
| `src/config.js` | Env-driven: `SITE_URL`, `ADS_ENABLED`, `ADSENSE_CLIENT`, slot IDs, `GOOGLE_SITE_VERIFICATION`. |

## Rules that matter
- No inline `style=""` in HTML or `setAttribute('style')`: the CSP blocks them. Use classes or `el.style.x`.
- CSP: `script-src 'self' 'wasm-unsafe-eval' 'sha256-<theme>'`. The policy is dropped only when ads are on.
- Text drawn into PDFs with standard fonts must be Latin only. Watermarks and typed signatures are drawn to canvas as images so any script works.
- Coordinates: tools work in display space (as seen); `pdf-ops` converts with `toUserSpace` for rotated pages.
- Redaction = rasterise marked pages, remove Annots/Outlines/AcroForm/StructTree/metadata, then `collectGarbage`.
- Adding a tool means: meta.js entry + SLUGS + NEXT, `tools/<id>.js`, content in `content/tools.js` + a CATEGORIES entry, a CSS icon (`.tool-icon-<id>`), unit and e2e tests.
- Keep forms simple: essentials visible, extras in `group: 'more'`. Apply a feature to every related tool.

## Tests
- `npm test`: node:test unit tests (`test/unit`, helpers in `test/helpers.js`: `makePdf`, `png`, `fakeJpeg`, `textOf` via pdf.js legacy, `containsText` checks plain + hex + UTF-16 hex in inflated streams).
- `SITE_URL=http://localhost:4173 npm run build && npx playwright test`: e2e in `test/e2e` (fixtures generated by `global-setup.js` into `.fixtures/`). Every test fails on page errors or any non-GET/external request. `@smoke` tests also run on mobile, Firefox and WebKit. `a11y.spec.js` uses axe.
- CI (`.github/workflows/ci.yml`): test+audit+build+check → e2e (chromium+mobile) → engines (firefox+webkit, non-blocking) → variants (custom domain + ads) → actionlint → deploy. `lockfile.yml` creates the package-lock PR (npm install is used until it is merged).

## Docs
`docs/ADSENSE.md`: domain and AdSense steps (kept in the repo only, never on the site; recommended: `pdf.<domain>` subdomain of gulfcalc's domain). `docs/TESTING.md`: test strategy and the manual release checklist.
