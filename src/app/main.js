// Entry point for every page.
import { formatBytes, pluralize } from './core/format.js';
import { describe } from './files.js';
import { handOff, installUploadGuard, onUpload } from './io.js';
import { SLUGS, TOOLS } from './tools/meta.js';
import { h, toolUrl } from './ui.js';

installUploadGuard();

// ---------- theme: system -> light -> dark ----------
const toggle = document.getElementById('theme-toggle');
toggle?.addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  const next = current === null ? 'light' : current === 'light' ? 'dark' : null;
  if (next) root.setAttribute('data-theme', next);
  else root.removeAttribute('data-theme');
  try {
    if (next) localStorage.setItem('pn-theme', next);
    else localStorage.removeItem('pn-theme');
  } catch {
    /* storage blocked: theme just won't be remembered */
  }
});

// ---------- the "file data sent" counter ----------
onUpload((bytes) => {
  for (const el of document.querySelectorAll('[data-sent]')) {
    el.textContent = formatBytes(bytes).replace(/^0 B$/, '0 bytes');
    el.closest('.zero')?.classList.toggle('alarm', bytes > 0);
  }
});

// ---------- tool pages ----------
const tool = document.getElementById('tool');
if (tool) {
  import('./runtime.js')
    .then((m) => m.startTool(tool))
    .catch((error) => {
      console.error(error);
      const box = document.getElementById('error');
      if (box) {
        box.className = 'alert error';
        box.textContent = 'This tool could not start. Please reload the page. If it keeps happening, try another browser.';
        box.hidden = false;
      }
    });
}

// ---------- home page: drop anything, get suggestions ----------
const homeDrop = document.getElementById('home-drop');
if (homeDrop) {
  const input = document.getElementById('home-input');
  const out = document.getElementById('suggest');
  const suggest = async (files) => {
    if (!files.length) return;
    const entries = await Promise.all(files.map(describe));
    const pdfs = entries.filter((e) => e.kind === 'pdf').length;
    const images = entries.filter((e) => e.isImage).length;
    let ids;
    if (pdfs && images) ids = ['merge'];
    else if (pdfs > 1) ids = ['merge', 'compress', 'remove-metadata'];
    else if (pdfs === 1) ids = ['compress', 'split', 'organize', 'sign', 'pdf-to-images', 'page-numbers', 'pdf-to-text', 'protect', 'redact'];
    else if (images) ids = images <= 2 ? ['images-to-pdf', 'id-scan'] : ['images-to-pdf'];
    else ids = [];
    const usable = entries.filter((e) => e.kind === 'pdf' || e.isImage);
    out.replaceChildren(
      ids.length
        ? h(
            'div',
            { class: 'suggest-box' },
            h('p', { class: 'suggest-title', text: `${pluralize(usable.length, 'file')} ready. What do you want to do?` }),
            h(
              'div',
              { class: 'next-links' },
              ids.map((id) =>
                h('button', {
                  type: 'button',
                  class: 'chip-link',
                  text: TOOLS[id].name,
                  onclick: async () => {
                    await handOff(usable.map((e) => ({ blob: e.file, name: e.name })));
                    window.location.href = toolUrl(SLUGS[id], '?from=home');
                  },
                }),
              ),
            ),
          )
        : h('p', { class: 'alert warn', text: 'Those files are not PDFs or images. pdfburrow works with PDF, JPG, PNG, HEIC, WebP and GIF files.' }),
    );
    out.hidden = false;
    out.querySelector('button')?.focus();
  };
  input?.addEventListener('change', () => {
    suggest([...input.files]);
    input.value = '';
  });
  homeDrop.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    homeDrop.classList.add('over');
  });
  homeDrop.addEventListener('dragleave', (e) => {
    if (!homeDrop.contains(e.relatedTarget)) homeDrop.classList.remove('over');
  });
  homeDrop.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    homeDrop.classList.remove('over');
    suggest([...e.dataTransfer.files]);
  });
}

// ---------- tool search on the home page ----------
const search = document.getElementById('tool-search');
if (search) {
  search.closest('[hidden]')?.removeAttribute('hidden');
  const empty = document.getElementById('no-tools');
  search.addEventListener('input', () => {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of document.querySelectorAll('.tool-group')) {
      let inGroup = 0;
      for (const card of group.querySelectorAll('.tool-card')) {
        const text = `${card.dataset.search} ${card.textContent}`.toLowerCase();
        const match = terms.every((t) => text.includes(t));
        card.parentElement.hidden = !match;
        if (match) inGroup += 1;
      }
      group.hidden = inGroup === 0;
      shown += inGroup;
    }
    if (empty) empty.hidden = shown > 0;
  });
}

// ---------- offline support ----------
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  const base = document.documentElement.dataset.base || '/';
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
}
