// HTML templates. Every function returns a string.
import { CATEGORIES, CONTENT } from './content/tools.js';
import { GUIDES } from './content/guides.js';
import { SLUGS, TOOLS } from './app/tools/meta.js';

export const THEME_BOOT =
  "(function(){try{var t=localStorage.getItem('pn-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();";

export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function head(ctx, { title, description, path, structured = [], noindex = false, extraFonts = '' }) {
  const { cfg } = ctx;
  const canonical = ctx.abs(path);
  const ads = cfg.ADS_ENABLED
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.ADSENSE_CLIENT)}" crossorigin="anonymous"></script>`
    : '';
  return `<!doctype html>
<html lang="en" dir="ltr" data-base="${esc(cfg.BASE_PATH)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${ctx.csp ? `<meta http-equiv="Content-Security-Policy" content="${esc(ctx.csp)}">` : ''}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="pdfburrow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#2F5BEA" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1118" media="(prefers-color-scheme: dark)">
${cfg.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(cfg.GOOGLE_SITE_VERIFICATION)}">` : ''}
<link rel="icon" href="${ctx.asset('icon.svg')}" type="image/svg+xml">
<link rel="manifest" href="${cfg.BASE_PATH}manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600;700${extraFonts}&display=swap">
<link rel="stylesheet" href="${ctx.asset('styles.css')}">
<script>${THEME_BOOT}</script>
<script type="module" src="${ctx.asset('app/main.js')}"></script>
${ads}
${structured.map(jsonLd).join('\n')}
</head>`;
}

function header(ctx) {
  const b = ctx.cfg.BASE_PATH;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="logo" href="${b}"><span class="logo-mark" aria-hidden="true"></span>pdfburrow</a>
    <nav class="top-nav" aria-label="Main">
      <a href="${b}#tools">All tools</a>
      <a href="${b}guides/">Guides</a>
      <a href="${b}about/">About</a>
      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch colour theme" title="Switch colour theme"><span aria-hidden="true"></span></button>
    </nav>
  </div>
</header>`;
}

function footer(ctx) {
  const b = ctx.cfg.BASE_PATH;
  const year = ctx.cfg.UPDATED.slice(0, 4);
  const toolLinks = CATEGORIES.flatMap((c) => c.tools)
    .map((id) => `<li><a href="${b}${SLUGS[id]}/">${esc(TOOLS[id].name)}</a></li>`)
    .join('');
  return `<footer class="site-footer">
  <div class="wrap foot">
    <nav aria-label="All tools"><h2 class="foot-title">Tools</h2><ul class="foot-tools">${toolLinks}</ul></nav>
    <nav aria-label="Site"><ul class="foot-links">
      <li><a href="${b}guides/">Guides</a></li>
      <li><a href="${b}about/">About</a></li>
      <li><a href="${b}privacy/">Privacy</a></li>
      <li><a href="${b}terms/">Terms</a></li>
      <li><a href="${b}contact/">Contact</a></li>
      <li><a href="${esc(ctx.cfg.REPO_URL)}" rel="noopener">Source code</a></li>
    </ul></nav>
    <p class="foot-note">Files are processed on your device and never uploaded. © ${year} pdfburrow · <a href="${esc(ctx.cfg.AUTHOR_URL)}" rel="noopener">${esc(ctx.cfg.AUTHOR)}</a></p>
  </div>
</footer>`;
}

function shell(ctx, opts, main) {
  return `${head(ctx, opts)}
<body>
${header(ctx)}
<main id="main" class="wrap main">
${main}
</main>
${footer(ctx)}
<div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
</body>
</html>
`;
}

function adSlot(ctx, name) {
  const { cfg } = ctx;
  const slot = cfg.AD_SLOTS[name];
  if (!cfg.ADS_ENABLED || !slot) return '';
  return `<aside class="ad" aria-label="Advertisement"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(cfg.ADSENSE_CLIENT)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;
}

const zeroBadge = () =>
  `<p class="zero" title="Counts any file data this page sends to a server">File data sent to any server: <b data-sent>0 bytes</b></p>`;

// ---------- option fields ----------

function fieldHTML(field) {
  const id = `opt-${field.id}`;
  const hint = field.hint ? `<span class="hint" id="${id}-hint">${esc(field.hint)}</span>` : '';
  const described = field.hint ? ` aria-describedby="${id}-hint"` : '';
  const show = field.showIf ? ` data-show-field="${esc(field.showIf.field)}" data-show-values="${esc(field.showIf.in.join('|'))}"` : '';
  let control;
  if (field.type === 'select') {
    const options = field.options
      .map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(field.default) ? ' selected' : ''}>${esc(label)}</option>`)
      .join('');
    control = `<select id="${id}" name="${esc(field.id)}"${described}>${options}</select>`;
  } else if (field.type === 'checkbox') {
    return `<div class="field check"${show}><input type="checkbox" id="${id}" name="${esc(field.id)}"${field.default ? ' checked' : ''}${described}><label for="${id}">${esc(field.label)}</label>${hint}</div>`;
  } else if (field.type === 'number') {
    control = `<input type="number" id="${id}" name="${esc(field.id)}" inputmode="decimal" value="${esc(field.default)}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''} step="${field.step ?? 'any'}"${described}>`;
  } else {
    const type = field.type === 'password' ? 'password' : 'text';
    control = `<input type="${type}" id="${id}" name="${esc(field.id)}" value="${esc(field.default)}"${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ''}${field.maxLength ? ` maxlength="${field.maxLength}"` : ''} autocomplete="${esc(field.autocomplete ?? 'off')}"${type === 'text' ? ' spellcheck="false"' : ''}${described}>`;
  }
  return `<div class="field"${show}><label for="${id}">${esc(field.label)}</label>${control}${hint}</div>`;
}

function optionsForm(meta) {
  if (!meta.fields.length) return '';
  const main = meta.fields.filter((f) => !f.group).map(fieldHTML).join('\n');
  const more = meta.fields.filter((f) => f.group === 'more').map(fieldHTML).join('\n');
  return `<form id="options" class="options" novalidate>
  ${main ? `<div class="form-grid">${main}</div>` : ''}
  ${more ? `<details class="more"><summary>More options</summary><div class="form-grid">${more}</div></details>` : ''}
</form>`;
}

function acceptAttr(accept) {
  const parts = [];
  if (accept.includes('pdf')) parts.push('.pdf,application/pdf');
  if (accept.includes('image')) parts.push('image/*,.heic,.heif');
  return parts.join(',');
}

function toolApp(id, preset = null) {
  const meta = TOOLS[id];
  const noun = meta.accept === 'image' ? (meta.multiple ? 'images' : 'an image') : meta.accept === 'pdf' ? (meta.multiple ? 'PDFs' : 'a PDF') : 'PDFs or images';
  // The file input stays outside the drop zone so "+ Add more" still works after the drop zone hides
  // (Safari won't open a file input that is inside a display:none element).
  return `<section class="tool" id="tool" data-tool="${esc(id)}"${preset ? ` data-preset="${esc(JSON.stringify(preset))}"` : ''} aria-label="${esc(meta.name)}">
  <input type="file" id="file-input" class="file-input" accept="${acceptAttr(meta.accept)}"${meta.multiple ? ' multiple' : ''}>
  <div class="drop" id="drop">
    <p class="drop-title">Drop ${noun} here</p>
    <label for="file-input" class="btn primary big">Choose ${meta.multiple ? 'files' : 'file'}</label>
    <p class="drop-hint">${esc(meta.hint)}</p>
  </div>
  <div class="workspace" id="workspace" hidden>
    <ul class="files" id="files" aria-label="Your files"></ul>
    <div class="files-bar"><label for="file-input" class="btn" id="add-more">${meta.multiple ? '+ Add more' : 'Choose a different file'}</label><span class="hint" id="files-total"></span></div>
    <div class="custom" id="custom" hidden></div>
    ${optionsForm(meta)}
    <div class="run-row">
      <button type="button" class="btn primary big" id="run" disabled>${esc(meta.button(1))}</button>
      <p class="hint" id="run-hint" aria-live="polite"></p>
    </div>
  </div>
  <div class="busy" id="busy" hidden>
    <div class="progress indeterminate" role="progressbar" aria-label="Progress"><span id="bar"></span></div>
    <p id="status" aria-live="polite">Working…</p>
    <button type="button" class="btn ghost" id="cancel">Cancel</button>
  </div>
  <div class="alert" id="error" role="alert" hidden></div>
  <section class="done" id="done" hidden aria-labelledby="done-title"></section>
  <noscript><p class="alert warn">This tool runs in your browser and needs JavaScript. Please turn it on to use pdfburrow.</p></noscript>
</section>`;
}

function toolCard(ctx, id) {
  const c = CONTENT[id];
  return `<li><a class="tool-card" href="${ctx.cfg.BASE_PATH}${SLUGS[id]}/" data-search="${esc(`${TOOLS[id].name} ${c.keywords}`)}"><span class="tool-icon tool-icon-${esc(id)}" aria-hidden="true"></span><span><strong>${esc(TOOLS[id].name)}</strong><span>${esc(c.card)}</span></span></a></li>`;
}

// ---------- pages ----------

export function toolPage(ctx, id, variant = null) {
  const meta = TOOLS[id];
  const c = CONTENT[id];
  const slug = variant ? `${SLUGS[id]}/${variant.slug}` : SLUGS[id];
  const h1 = variant ? `Compress PDF to ${variant.label}` : meta.name;
  const intro = variant ? variant.intro : c.intro;
  const title = `${variant ? variant.metaTitle : c.metaTitle} | pdfburrow`;
  const description = variant ? variant.description : c.description;
  const b = ctx.cfg.BASE_PATH;
  const crumbs = variant
    ? `<a href="${b}">Home</a> <span aria-hidden="true">›</span> <a href="${b}${SLUGS[id]}/">${esc(meta.name)}</a> <span aria-hidden="true">›</span> <span>${esc(variant.label)}</span>`
    : `<a href="${b}">Home</a> <span aria-hidden="true">›</span> <span>${esc(meta.name)}</span>`;
  const sizeLinks =
    id === 'compress'
      ? `<nav class="size-links" aria-label="Compress to a size"><span>Compress to:</span> ${ctx.sizePages
          .map((s) => `<a href="${b}compress-pdf/${s.slug}/"${variant?.slug === s.slug ? ' aria-current="page"' : ''}>${esc(s.label)}</a>`)
          .join(' ')}</nav>`
      : '';
  const guide = GUIDES.find((g) => g.tool === id);
  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: h1,
      url: ctx.abs(`${slug}/`),
      description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (runs in the browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ctx.abs('') },
        { '@type': 'ListItem', position: 2, name: meta.name, item: ctx.abs(`${SLUGS[id]}/`) },
        ...(variant ? [{ '@type': 'ListItem', position: 3, name: variant.label, item: ctx.abs(`${slug}/`) }] : []),
      ],
    },
  ];
  const main = `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
<header class="page-head">
  <h1>${esc(h1)}</h1>
  <p class="lede">${esc(intro)}</p>
  ${zeroBadge()}
</header>
${toolApp(id, variant ? { level: String(variant.kb) } : null)}
${sizeLinks}
<div class="content">
  <section class="howto">
    <h2>How to ${esc(variant ? `compress a PDF to ${variant.label}` : meta.name.charAt(0).toLowerCase() + meta.name.slice(1))}</h2>
    <ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>
  ${adSlot(ctx, 'tool')}
  <section class="faq">
    <h2>Questions</h2>
    ${c.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
  </section>
  ${guide ? `<p class="guide-link">Guide: <a href="${b}guides/${guide.slug}/">${esc(guide.title)}</a></p>` : ''}
  <section class="related">
    <h2>Related tools</h2>
    <ul class="tool-cards">${c.related.map((r) => toolCard(ctx, r)).join('')}</ul>
  </section>
</div>`;
  return shell(ctx, { title, description, path: `${slug}/`, structured, extraFonts: id === 'sign' ? '&family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes' : '' }, main);
}

export function homePage(ctx) {
  const b = ctx.cfg.BASE_PATH;
  const groups = CATEGORIES.map(
    (cat) => `<section class="tool-group" aria-labelledby="cat-${cat.id}"><h2 id="cat-${cat.id}">${esc(cat.name)}</h2><ul class="tool-cards">${cat.tools.map((id) => toolCard(ctx, id)).join('')}</ul></section>`,
  ).join('\n');
  const main = `<section class="hero">
  ${zeroBadge()}
  <h1>PDF tools that <mark>never upload</mark> your files</h1>
  <p class="lede">Merge, compress, split, sign, redact and convert PDFs right in your browser. Free, no sign-up, no limits, no watermark, and it works offline.</p>
</section>
<section class="drop home-drop" id="home-drop" aria-label="Start with your files">
  <input type="file" id="home-input" class="file-input" multiple accept=".pdf,application/pdf,image/*,.heic,.heif">
  <p class="drop-title">Drop PDFs or images here</p>
  <label for="home-input" class="btn primary big">Choose files</label>
  <p class="drop-hint">We’ll suggest what you can do with them. Processed on your device.</p>
</section>
<div id="suggest" class="suggest" hidden aria-live="polite"></div>
<div id="tools" class="tools-index">
  <div class="tool-search" hidden><label for="tool-search" class="sr-only">Search tools</label><input type="search" id="tool-search" placeholder="Search tools, e.g. compress, sign, jpg" autocomplete="off"></div>
  ${groups}
  <p class="hint" id="no-tools" hidden>No tool matches that search.</p>
</div>
<section class="why" aria-labelledby="why-h">
  <h2 id="why-h" class="sr-only">Why pdfburrow</h2>
  <div><h3>Nothing is uploaded</h3><p>Your files are read and changed on your device. Watch the counter at the top: it stays at 0 bytes.</p></div>
  <div><h3>No limits, no watermark</h3><p>Use any tool as often as you like on files as large as your device can handle. Nothing is stamped on your file.</p></div>
  <div><h3>Works offline</h3><p>After your first visit, every tool works without internet. Add it to your home screen like an app.</p></div>
</section>
<section class="guides-teaser" aria-labelledby="guides-h">
  <h2 id="guides-h">Guides</h2>
  <ul class="guide-list">${GUIDES.slice(0, 4).map((g) => `<li><a href="${b}guides/${g.slug}/">${esc(g.title)}</a></li>`).join('')}</ul>
  <p><a href="${b}guides/">All guides</a></p>
</section>
${adSlot(ctx, 'home')}`;
  return shell(
    ctx,
    {
      title: 'pdfburrow – Free PDF Tools That Never Upload Your Files',
      description: 'Merge, compress, split, sign, redact and convert PDFs in your browser. Free, private, no upload, no sign-up, no watermark, works offline.',
      path: '',
      structured: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'pdfburrow', url: ctx.abs(''), description: 'Free PDF tools that run in your browser.' }],
    },
    main,
  );
}

export function guidesIndex(ctx) {
  const b = ctx.cfg.BASE_PATH;
  const main = `<header class="page-head"><h1>Guides</h1><p class="lede">Short, practical answers to everyday PDF problems.</p></header>
<ul class="guide-cards">${GUIDES.map((g) => `<li><a href="${b}guides/${g.slug}/"><strong>${esc(g.title)}</strong><span>${esc(g.description)}</span></a></li>`).join('')}</ul>`;
  return shell(ctx, { title: 'PDF Guides – Practical How-tos | pdfburrow', description: 'Practical guides: shrink a PDF for upload limits, sign without printing, redact properly, make scans searchable and more.', path: 'guides/' }, main);
}

export function guidePage(ctx, g) {
  const b = ctx.cfg.BASE_PATH;
  const tool = TOOLS[g.tool];
  const main = `<nav class="crumbs" aria-label="Breadcrumb"><a href="${b}">Home</a> <span aria-hidden="true">›</span> <a href="${b}guides/">Guides</a> <span aria-hidden="true">›</span> <span>${esc(g.title)}</span></nav>
<article class="prose">
  <h1>${esc(g.title)}</h1>
  <p class="lede">${esc(g.intro)}</p>
  <h2>Step by step</h2>
  <ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <p><a class="btn primary" href="${b}${SLUGS[g.tool]}/">Open ${esc(tool.name)}</a></p>
  ${adSlot(ctx, 'guide')}
  ${g.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('\n')}
  <p class="meta">Updated ${esc(ctx.updatedText)}</p>
</article>`;
  return shell(
    ctx,
    {
      title: `${g.title} | pdfburrow`,
      description: g.description,
      path: `guides/${g.slug}/`,
      structured: [
        { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, dateModified: ctx.cfg.UPDATED, author: { '@type': 'Person', name: ctx.cfg.AUTHOR, url: ctx.cfg.AUTHOR_URL }, mainEntityOfPage: ctx.abs(`guides/${g.slug}/`) },
      ],
    },
    main,
  );
}

export function staticPage(ctx, p) {
  const main = `<article class="prose"><h1>${esc(p.title)}</h1>${p.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((x) => `<p>${esc(x)}</p>`).join('')}`).join('\n')}</article>`;
  return shell(ctx, { title: `${p.title} | pdfburrow`, description: p.description, path: `${p.slug}/` }, main);
}

export function notFoundPage(ctx) {
  const main = `<header class="page-head"><h1>Page not found</h1><p class="lede">This page doesn’t exist or has moved. All the tools are on the home page.</p><p><a class="btn primary" href="${ctx.cfg.BASE_PATH}">See all tools</a></p></header>`;
  return shell(ctx, { title: 'Page not found | pdfburrow', description: 'This page does not exist. Find every pdfburrow tool on the home page.', path: '', noindex: true }, main);
}
