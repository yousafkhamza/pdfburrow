// Static site build: `node build.mjs` (after `npm ci`) writes the site to dist/.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cfg from './src/config.js';
import { GUIDES } from './src/content/guides.js';
import { staticPages } from './src/content/static.js';
import { SIZE_PAGES } from './src/content/tools.js';
import { SLUGS, TOOL_IDS } from './src/app/tools/meta.js';
import { guidePage, guidesIndex, homePage, notFoundPage, staticPage, THEME_BOOT, toolPage } from './src/templates.js';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const modules = join(root, 'node_modules');
const sha256 = (data, enc = 'hex') => createHash('sha256').update(data).digest(enc);

function write(path, content) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file) => file.slice(out.length + 1).split('\\').join('/');

// ---------- 1. app code and assets ----------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'src', 'assets'), join(out, 'assets'), { recursive: true });
cpSync(join(root, 'src', 'app'), join(out, 'assets', 'app'), { recursive: true });

// ---------- 2. self-hosted libraries (pinned in package.json, integrity-checked by npm ci) ----------
const VENDOR = [
  { pkg: 'pdf-lib', from: 'dist/pdf-lib.esm.min.js', to: 'pdf-lib/pdf-lib.esm.min.js' },
  { pkg: 'pdfjs-dist', from: 'build/pdf.min.mjs', to: 'pdfjs/pdf.min.mjs' },
  { pkg: 'pdfjs-dist', from: 'build/pdf.worker.min.mjs', to: 'pdfjs/pdf.worker.min.mjs' },
  { pkg: 'pdfjs-dist', dir: 'cmaps', to: 'pdfjs/cmaps' },
  { pkg: 'pdfjs-dist', dir: 'standard_fonts', to: 'pdfjs/standard_fonts' },
  { pkg: 'fflate', from: 'esm/browser.js', to: 'fflate/browser.js' },
  { pkg: 'tesseract.js', from: 'dist/tesseract.min.js', to: 'tesseract/tesseract.min.js' },
  { pkg: 'tesseract.js', from: 'dist/worker.min.js', to: 'tesseract/worker.min.js' },
  { pkg: 'tesseract.js-core', match: /^tesseract-core.*\.(js|wasm)$/, to: 'tesseract-core' },
  { pkg: '@tesseract.js-data/eng', from: '4.0.0_best_int/eng.traineddata.gz', to: 'tesseract-lang/eng.traineddata.gz' },
  { pkg: 'heic2any', from: 'dist/heic2any.min.js', to: 'heic2any/heic2any.min.js' },
  { pkg: '@neslinesli93/qpdf-wasm', from: 'dist/qpdf.wasm', to: 'qpdf/qpdf.wasm' },
  { pkg: '@neslinesli93/qpdf-wasm', from: 'dist/qpdf.js', to: 'qpdf/qpdf.mjs', esm: true },
];

/**
 * qpdf-wasm ships an Emscripten script, not an ES module. Wrap it so the browser can import it:
 * keep the code and add `export default <factory>`.
 */
function asEsModule(source) {
  if (/^\s*export\s+default\b/m.test(source)) return source;
  const name = source.match(/module\.exports\s*=\s*([A-Za-z_$][\w$]*)/)?.[1] ?? source.match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*(?:\(\)\s*=>|function)/m)?.[1];
  if (!name) throw new Error('qpdf.js: could not find the module factory to export. Check the qpdf-wasm version.');
  return `${source}\nexport default ${name};\n`;
}

const versions = {};
const vendorDir = join(out, 'assets', 'vendor');
for (const item of VENDOR) {
  const pkgDir = join(modules, ...item.pkg.split('/'));
  if (!existsSync(pkgDir)) throw new Error(`Missing package ${item.pkg}. Run "npm ci" first.`);
  versions[item.pkg] = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  const target = join(vendorDir, item.to);
  if (item.dir) {
    if (!existsSync(join(pkgDir, item.dir))) throw new Error(`${item.pkg} has no ${item.dir}/ directory`);
    cpSync(join(pkgDir, item.dir), target, { recursive: true });
  } else if (item.match) {
    const files = readdirSync(pkgDir).filter((f) => item.match.test(f));
    if (!files.length) throw new Error(`${item.pkg}: no files match ${item.match}`);
    mkdirSync(target, { recursive: true });
    for (const f of files) cpSync(join(pkgDir, f), join(target, f));
  } else {
    const source = join(pkgDir, item.from);
    if (!existsSync(source)) throw new Error(`${item.pkg}: ${item.from} not found (files: ${readdirSync(dirname(source)).join(', ')})`);
    mkdirSync(dirname(target), { recursive: true });
    if (item.esm) writeFileSync(target, asEsModule(readFileSync(source, 'utf8')));
    else cpSync(source, target);
  }
}

// Record what was shipped: versions and a checksum of every library file.
const vendorFiles = walk(vendorDir).filter((f) => !f.includes(`${join('pdfjs', 'cmaps')}`) && !f.includes(join('pdfjs', 'standard_fonts')));
write(
  'assets/vendor/VERSIONS.json',
  JSON.stringify(
    {
      packages: versions,
      files: Object.fromEntries(vendorFiles.map((f) => [rel(f).replace('assets/vendor/', ''), `sha256-${sha256(readFileSync(f), 'base64')}`])),
    },
    null,
    2,
  ),
);

// ---------- 3. pages ----------
const appFiles = walk(join(out, 'assets')).filter((f) => !f.includes(`${join('assets', 'vendor')}`));
const version = sha256(appFiles.map((f) => readFileSync(f)).join('\n') + JSON.stringify(versions)).slice(0, 10);
const ORIGIN = new URL(cfg.SITE_URL).origin;
const https = cfg.SITE_URL.startsWith('https://');
const csp = cfg.ADS_ENABLED
  ? ''
  : [
      "default-src 'self'",
      // wasm-unsafe-eval lets WebAssembly (qpdf, OCR) compile; it does not allow JavaScript eval.
      `script-src 'self' 'wasm-unsafe-eval' 'sha256-${sha256(THEME_BOOT, 'base64')}'`,
      "style-src 'self' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data: blob:",
      "connect-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(https ? ['upgrade-insecure-requests'] : []),
    ].join('; ');

const updatedText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cfg.UPDATED}T00:00:00Z`));
const ctx = {
  cfg,
  csp,
  updatedText,
  sizePages: SIZE_PAGES,
  abs: (path) => `${ORIGIN}${cfg.BASE_PATH}${path}`,
  asset: (path) => `${cfg.BASE_PATH}assets/${path}?v=${version}`,
};

const indexable = [];
const page = (path, html) => {
  write(`${path}index.html`, html);
  indexable.push(path);
};

page('', homePage(ctx));
for (const id of TOOL_IDS) page(`${SLUGS[id]}/`, toolPage(ctx, id));
for (const s of SIZE_PAGES) page(`compress-pdf/${s.slug}/`, toolPage(ctx, 'compress', s));
page('guides/', guidesIndex(ctx));
for (const g of GUIDES) page(`guides/${g.slug}/`, guidePage(ctx, g));
for (const p of staticPages({ repoUrl: cfg.REPO_URL, updated: updatedText })) page(`${p.slug}/`, staticPage(ctx, p));
write('404.html', notFoundPage(ctx));

// ---------- 4. sitemap, robots, manifest, ads.txt ----------
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${ctx.abs(p)}</loc><lastmod>${cfg.UPDATED}</lastmod></url>`).join('\n')}
</urlset>
`,
);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${cfg.SITE_URL}/sitemap.xml\n`);
write(
  'manifest.webmanifest',
  JSON.stringify(
    {
      name: 'pdfburrow: PDF tools that never upload your files',
      short_name: 'pdfburrow',
      description: 'Merge, compress, split, sign and convert PDFs on your device.',
      start_url: cfg.BASE_PATH,
      scope: cfg.BASE_PATH,
      display: 'standalone',
      background_color: '#F4F5F8',
      theme_color: '#2F5BEA',
      icons: [{ src: `${cfg.BASE_PATH}assets/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      share_target: undefined,
    },
    null,
    2,
  ),
);
if (cfg.ADSENSE_CLIENT) write('ads.txt', `google.com, ${cfg.ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
write('.nojekyll', '');

// ---------- 5. service worker ----------
// Precache pages and the core app (pdf-lib, pdf.js) so the main tools work offline.
// OCR, qpdf and HEIC files are large; they are cached the first time a tool uses them.
const core = walk(join(out, 'assets'))
  .map(rel)
  .filter((p) => !/vendor\/(tesseract|tesseract-core|tesseract-lang|heic2any|qpdf)\//.test(p) && !p.endsWith('VERSIONS.json'))
  .filter((p) => !/vendor\/pdfjs\/(cmaps|standard_fonts)\//.test(p));
const precache = [...indexable.map((p) => `${cfg.BASE_PATH}${p}`), ...core.map((p) => `${cfg.BASE_PATH}${p}`)];
write(
  'sw.js',
  `// Generated by build.mjs
const CACHE = 'pdfburrow-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pdfburrow-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match(${JSON.stringify(cfg.BASE_PATH)}))),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});
`,
);

const htmlCount = walk(out).filter((f) => f.endsWith('.html')).length;
console.log(`Built ${htmlCount} pages for ${cfg.SITE_URL} (ads ${cfg.ADS_ENABLED ? 'on' : 'off'}, version ${version})`);
console.log(`Libraries: ${Object.entries(versions).map(([k, v]) => `${k}@${v}`).join(', ')}`);
