// Post-build quality gate. Run after `npm run build`; exits non-zero on any problem.
// Pages: links and anchors, SEO tags, one <h1>, valid JSON-LD, leaked values, duplicate ids,
//        labels pointing nowhere, tool forms matching their definitions.
// Security: CSP present (ads off) / absent (ads on), inline scripts allowed by hash, no inline styles.
// Code: every shipped script parses; every module import resolves; no bare imports.
// Files: vendored libraries present and matching VERSIONS.json, service worker list, sitemap, robots, ads.txt.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADS_ENABLED, ADSENSE_CLIENT, BASE_PATH, SITE_URL } from '../src/config.js';
import { TOOLS } from '../src/app/tools/meta.js';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const rel = (f) => f.slice(dist.length + 1).split('\\').join('/');
const files = walk(dist);
const pages = files.filter((f) => f.endsWith('.html'));
const ORIGIN = new URL(SITE_URL).origin;
const problems = [];
const fail = (m) => problems.push(m);

const decode = (t) => t?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function fileFor(pathname) {
  const path = decodeURI(pathname);
  if (!path.startsWith(BASE_PATH)) return null;
  let local = path.slice(BASE_PATH.length);
  if (local === '' || local.endsWith('/')) local += 'index.html';
  return join(dist, local);
}
const idCache = new Map();
const idsIn = (file) => {
  if (!idCache.has(file)) idCache.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(file);
};

// ---------- pages ----------
for (const file of pages) {
  const name = rel(file);
  const html = readFileSync(file, 'utf8');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const bad of ['undefined', 'NaN', '[object Object]', '${']) if (visible.includes(bad)) fail(`${name}: page text contains "${bad}"`);
  if (!html.startsWith('<!doctype html>')) fail(`${name}: missing doctype`);
  if (!/<html lang="en" dir="ltr" data-base="[^"]+">/.test(html)) fail(`${name}: <html> must have lang, dir and data-base`);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  if (title.length < 15 || title.length > 70) fail(`${name}: title is ${title.length} characters (want 15-70): ${title}`);
  const desc = html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? '';
  if (decode(desc).length < 50 || decode(desc).length > 170) fail(`${name}: meta description is ${decode(desc).length} characters (want 50-170)`);
  const is404 = name === '404.html';
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  if (is404) {
    if (canonical || !html.includes('content="noindex"')) fail(`${name}: 404 must be noindex without canonical`);
  } else {
    const expected = `${ORIGIN}${BASE_PATH}${name.replace(/index\.html$/, '')}`;
    if (canonical !== expected) fail(`${name}: canonical ${canonical} should be ${expected}`);
  }
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`${name}: expected one <h1>, found ${h1}`);
  if (!html.includes('id="announcer"')) fail(`${name}: missing live region`);

  const csp = decode(html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1]);
  const adScript = html.includes('pagead2.googlesyndication.com');
  if (ADS_ENABLED) {
    if (!adScript) fail(`${name}: ads enabled but AdSense script missing`);
    if (csp) fail(`${name}: CSP would block AdSense`);
  } else {
    if (adScript) fail(`${name}: AdSense script present while ads are off`);
    if (!csp) fail(`${name}: missing Content-Security-Policy`);
  }
  if (csp) {
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      if (!csp.includes(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)) fail(`${name}: inline script not allowed by CSP`);
    }
    if (/\sstyle="/.test(html)) fail(`${name}: inline style attribute is blocked by CSP`);
    if (!csp.includes("'wasm-unsafe-eval'")) fail(`${name}: CSP must allow WebAssembly for qpdf and OCR`);
    if (/'unsafe-eval'|'unsafe-inline'/.test(csp)) fail(`${name}: CSP must not allow unsafe-eval or unsafe-inline`);
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail(`${name}: duplicate ids ${[...new Set(dupes)].join(', ')}`);
  const idSet = new Set(ids);
  for (const m of html.matchAll(/<label for="([^"]+)"/g)) if (!idSet.has(m[1])) fail(`${name}: label for missing #${m[1]}`);
  for (const m of html.matchAll(/aria-(?:describedby|labelledby|controls)="([^"]+)"/g)) {
    for (const id of m[1].split(/\s+/)) if (!idSet.has(id)) fail(`${name}: aria reference to missing #${id}`);
  }

  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = decode(m[1]);
    if (raw.startsWith('#')) {
      if (raw.length > 1 && !idSet.has(raw.slice(1))) fail(`${name}: anchor ${raw} has no target`);
      continue;
    }
    let url;
    try {
      url = new URL(raw, `${ORIGIN}${BASE_PATH}${name}`);
    } catch {
      fail(`${name}: invalid URL ${raw}`);
      continue;
    }
    if (url.origin !== ORIGIN) continue;
    const target = fileFor(url.pathname);
    if (!target) continue; // same domain, outside the site (e.g. the author's portfolio)
    if (!existsSync(target)) fail(`${name}: broken link ${raw}`);
    else if (url.hash.length > 1 && target.endsWith('.html') && !idsIn(target).has(url.hash.slice(1))) fail(`${name}: ${raw} has no anchor target`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      fail(`${name}: invalid JSON-LD`);
    }
  }

  const toolId = html.match(/<section class="tool" id="tool" data-tool="([^"]+)"/)?.[1];
  if (toolId) {
    const meta = TOOLS[toolId];
    if (!meta) fail(`${name}: unknown tool ${toolId}`);
    else {
      for (const id of ['drop', 'file-input', 'workspace', 'files', 'custom', 'run', 'run-hint', 'busy', 'bar', 'status', 'cancel', 'error', 'done']) {
        if (!idSet.has(id)) fail(`${name}: tool is missing #${id}`);
      }
      const names = [...html.matchAll(/\sid="opt-[^"]+" name="([^"]+)"/g)].map((m) => m[1]).sort();
      const expected = meta.fields.map((f) => f.id).sort();
      if (names.join() !== expected.join()) fail(`${name}: option fields [${names}] don't match [${expected}]`);
      for (const m of html.matchAll(/data-show-field="([^"]+)"/g)) if (!expected.includes(m[1])) fail(`${name}: showIf on unknown field ${m[1]}`);
    }
  }
}

// ---------- code ----------
const scripts = files.filter((f) => /\.(m?js)$/.test(f) && !f.includes(join('assets', 'vendor')));
for (const file of scripts) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${rel(file)}: syntax error\n${r.stderr.trim()}`);
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/^\s*(?:import|export)\s[^;'"`]*?\sfrom\s+'([^']+)'/gm)) {
    if (!m[1].startsWith('.')) fail(`${rel(file)}: bare import "${m[1]}" won't load in a browser`);
    else if (!existsSync(resolve(dirname(file), m[1]))) fail(`${rel(file)}: import "${m[1]}" not found`);
  }
}
{
  const r = spawnSync(process.execPath, ['--check', join(dist, 'assets', 'vendor', 'qpdf', 'qpdf.mjs')], { encoding: 'utf8' });
  if (r.status !== 0) fail(`vendor/qpdf/qpdf.mjs does not parse as a module\n${r.stderr.trim()}`);
}
for (const id of Object.keys(TOOLS)) {
  if (!existsSync(join(dist, 'assets', 'app', 'tools', `${id}.js`))) fail(`tool code missing: assets/app/tools/${id}.js`);
}
// The qpdf wrapper must be a real module with a default export.
const qpdf = join(dist, 'assets', 'vendor', 'qpdf', 'qpdf.mjs');
if (!existsSync(qpdf) || !/export default [A-Za-z_$][\w$]*;?\s*$/.test(readFileSync(qpdf, 'utf8').trimEnd()) && !/^\s*export\s+default\b/m.test(readFileSync(qpdf, 'utf8'))) {
  fail('vendor/qpdf/qpdf.mjs has no default export');
}

// ---------- vendored libraries ----------
const versions = JSON.parse(readFileSync(join(dist, 'assets', 'vendor', 'VERSIONS.json'), 'utf8'));
for (const [path, hash] of Object.entries(versions.files)) {
  const f = join(dist, 'assets', 'vendor', path);
  if (!existsSync(f)) fail(`vendor file listed but missing: ${path}`);
  else if (`sha256-${createHash('sha256').update(readFileSync(f)).digest('base64')}` !== hash) fail(`vendor file changed after build: ${path}`);
}
for (const required of ['pdf-lib/pdf-lib.esm.min.js', 'pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs', 'fflate/browser.js', 'tesseract/tesseract.min.js', 'tesseract/worker.min.js', 'tesseract-lang/eng.traineddata.gz', 'heic2any/heic2any.min.js', 'qpdf/qpdf.wasm', 'qpdf/qpdf.mjs']) {
  if (!existsSync(join(dist, 'assets', 'vendor', required))) fail(`missing library file ${required}`);
}
if (!readdirSync(join(dist, 'assets', 'vendor', 'tesseract-core')).some((f) => f.endsWith('.wasm.js') || f.endsWith('.wasm'))) fail('tesseract-core has no wasm files');

// ---------- site files ----------
for (const f of ['sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'sw.js', '404.html', '.nojekyll']) if (!existsSync(join(dist, f))) fail(`missing ${f}`);
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
for (const p of JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)?.[1] ?? '[]')) {
  const t = fileFor(p);
  if (!t || !existsSync(t)) fail(`sw.js precaches missing ${p}`);
}
const locs = [...readFileSync(join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length !== pages.length - 1) fail(`sitemap lists ${locs.length} URLs for ${pages.length - 1} pages`);
for (const loc of locs) {
  const t = fileFor(new URL(loc).pathname);
  if (!t || !existsSync(t)) fail(`sitemap URL has no page: ${loc}`);
}
if (!readFileSync(join(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail('robots.txt sitemap URL is wrong');
if (ADSENSE_CLIENT) {
  const ads = join(dist, 'ads.txt');
  if (!existsSync(ads) || !/^google\.com, pub-\d{10,20}, DIRECT, f08c47fec0942fa0\n$/.test(readFileSync(ads, 'utf8'))) fail('ads.txt missing or wrong');
} else if (existsSync(join(dist, 'ads.txt'))) fail('ads.txt present without ADSENSE_CLIENT');

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Checked ${pages.length} pages and ${scripts.length} scripts for ${SITE_URL} (ads ${ADS_ENABLED ? 'on' : 'off'}): no problems.`);
