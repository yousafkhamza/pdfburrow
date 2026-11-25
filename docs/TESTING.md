# How pdfburrow is tested

pdfburrow handles people's passports, contracts and payslips, so the bar is: every tool works on real files, nothing leaves the browser, and "removed" means removed. Every pull request runs all of the checks below in CI, and nothing deploys unless they pass.

## The layers

| Layer | What it checks | Where | Runs in |
|---|---|---|---|
| Unit: logic | Page ranges, file type detection, image headers and EXIF rotation, page geometry for all four rotations, compression strategy, option parsing | `test/unit/core.test.js`, `layout.test.js`, `site.test.js` | Node, under a second |
| Unit: PDF engine | Every operation on real PDFs, checking the output with pdf.js: merge, split, organize, page numbers, stamps, watermarks, forms, metadata, crop and resize, ID layout, redaction, OCR page swap, compression | `test/unit/pdf-ops.test.js` | Node, a few seconds |
| Build checks | Every page: links and anchors, titles and descriptions, canonical URLs, one `<h1>`, valid structured data, labels, unique IDs, security policy (and its script hash), no inline styles, every script parses, every import resolves, library files present and unchanged, sitemap, service worker list, `ads.txt` | `scripts/check.mjs` | After every build, including the ads-on and custom-domain variants |
| Browser (end to end) | Each tool used the way a person would: pick files, change options, press the button, download. The downloaded file is then checked (page count, text, form values, encryption, crop box, metadata) | `test/e2e/tools.spec.js` | Chrome (all tests); phone, Firefox, Safari engine (`@smoke` tests) |
| Accessibility | axe WCAG 2.1 A/AA scan on main pages and on tools before and after adding files; the file picker can be reached with the keyboard | `test/e2e/a11y.spec.js` | Chrome |

## Guarantees checked in every browser test

Every browser test also fails if:
- the page throws a JavaScript error
- the page makes **any** request other than a plain `GET` to the site itself (or Google Fonts). A file upload, a POST or a request to an analytics server would all fail the test.

## Security-critical checks

- **Redaction removes, not covers.** The test confirms that the original file *does* contain the secret (a positive control), then that the redacted file contains it in **no form**: plain, hex or UTF-16 hex, including inside compressed streams. The same applies to metadata removal and to unreferenced objects.
- **Passwords.** A protect then unlock round trip: the protected file must refuse to open without the password, a wrong password must give a clear message, and the right one must restore the original pages.
- **Locked files.** Other tools refuse a password-protected PDF and point to Unlock.

## Edge cases covered

- Rotated pages (90°, 180°, 270°): page numbers, stamps and crops land where people see them.
- Phone photos with EXIF rotation come out upright.
- Page ranges people actually type: `1-3, 5, 8-end`, `-3`, `4-`, `last`, `odd`, reversed ranges, and clear messages for pages that don't exist.
- Files that aren't PDFs, damaged files, a text-only PDF that's "already small", a PDF with no form fields.
- Compression to a target size always returns the best quality that fits, or says plainly that it couldn't fit.

## Running tests locally

```sh
npm install
npm test                                        # unit tests
npm run build && npm run check                  # build and check every page
SITE_URL=http://localhost:4173 npm run build    # build for the browser tests
npx playwright install chromium
npx playwright test --project=chromium          # all browser tests
npx playwright test --project=mobile            # the @smoke tests on a phone
```

When a browser test fails in CI, open the `playwright-report` artifact: it has a trace, screenshot and video of the failing step.

## Before each release (manual, 10 minutes)

Automated tests cover the logic. These need human eyes:

1. On a real phone (iPhone Safari and Android Chrome): merge two photos from the camera roll, compress the result to 200 KB, and sign a PDF with a finger.
2. Open a downloaded PDF in Acrobat Reader and in the phone's built-in viewer: check pages, signature position and page numbers look right.
3. Turn off Wi-Fi after visiting once: Merge and Compress still work.
4. Try a large file (100+ pages): the progress bar moves and the page stays responsive.
5. Dark mode and keyboard-only use on one tool.
