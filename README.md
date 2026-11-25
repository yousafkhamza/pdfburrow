# pdfburrow

Free PDF tools that run in your browser. **Files are never uploaded.** No sign-up, no limits, no watermark, and it works offline.

**Live:** https://yousafkhamza.github.io/pdfburrow/

## Tools

| Combine & organize | Shrink & convert | Sign & edit | Privacy & security |
|---|---|---|---|
| Merge PDF | Compress PDF (to a size like 200 KB) | Sign PDF (draw, type, upload) | Protect PDF (AES-256) |
| Split PDF | JPG to PDF (incl. iPhone HEIC) | Fill PDF form | Unlock PDF |
| Organize pages | PDF to JPG/PNG | Page numbers | Redact PDF (true removal) |
| Crop & resize | PDF to text + OCR, searchable PDF | Watermark (any language) | Remove metadata |

Plus **ID & passport to PDF**: front and back of a card on one A4 page, at real size.

Every tool page shows a live **"file data sent to any server: 0 bytes"** counter.

## How it works

- **Static site** generated with plain Node.js and hosted on GitHub Pages. There is no server.
- **Processing runs on the device:**
  - pdf-lib in a Web Worker for editing;
  - Mozilla pdf.js for reading and rendering;
  - qpdf (WebAssembly) for encryption;
  - Tesseract (WebAssembly) for OCR;
  - heic2any for iPhone photos.
- **All libraries are self-hosted**, pinned to exact versions, and recorded with checksums in `assets/vendor/VERSIONS.json`. There's no CDN, so no third party sees your files.
- **Strict Content-Security-Policy:** no inline scripts except one hashed theme snippet, no `eval`, and WebAssembly allowed only through `wasm-unsafe-eval`.
- **Offline support:** a service worker caches the pages and core tools, and the large OCR and encryption files are cached after their first use.

## Project layout

```
src/app/core/       pure logic: ranges, geometry, compression plan, file sniffing (unit tested)
src/app/pdf-ops.js  every PDF operation (pdf-lib), runs in the worker (unit tested)
src/app/worker.js   the PDF engine worker
src/app/runtime.js  the tool page: files, options, run, result
src/app/tools/      one file per tool; meta.js defines names, options and buttons
src/content/        page text: tools, guides, about/privacy/terms
src/templates.js    HTML
build.mjs           builds dist/, copies pinned libraries, sitemap, service worker
scripts/check.mjs   checks every built page and file
test/unit/          Node tests        test/e2e/   Playwright browser tests
docs/               TESTING.md, ADSENSE.md
```

## Development

Needs Node.js 22 or later.

```sh
npm install
npm test                                     # unit tests
npm run build && npm run check               # build + checks
SITE_URL=http://localhost:4173 npm run build && npm run serve   # preview at http://localhost:4173
npx playwright install chromium && npx playwright test --project=chromium   # browser tests
```

See [docs/TESTING.md](docs/TESTING.md) for what each test layer covers.

## Deployment

1. *Settings → Pages → Source: **GitHub Actions***.
2. Push to `main`. CI runs unit tests, a dependency audit, the build and page checks, browser tests (Chrome desktop and phone), build variants and workflow lint, then deploys. Firefox and Safari-engine results are reported on every run.
3. Once, run *Actions → **Lockfile** → Run workflow* to open a pull request adding `package-lock.json`, and merge it. CI then installs with `npm ci`, which verifies every package's integrity. This needs *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.

## Custom domain and ads

[docs/ADSENSE.md](docs/ADSENSE.md) has the full steps. It only needs DNS records and repository variables; no code changes.

## License

[MIT](LICENSE) © Yousaf K Hamza
