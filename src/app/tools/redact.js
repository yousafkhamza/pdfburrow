import { pluralize } from '../core/format.js';
import { pdfOf } from '../files.js';
import { canvasToBytes, openPdf, pageText, renderPage, textBoxes } from '../render.js';
import { announce, h } from '../ui.js';
import { copyBytes, outName, pdfFile } from './common.js';

const DPI = 200;
const s = { boxes: new Map(), doc: null, sheets: [], term: '', els: {} };

function allBoxes() {
  let n = 0;
  for (const list of s.boxes.values()) n += list.length;
  return n;
}

function drawBoxes(pageIndex) {
  const sheet = s.sheets[pageIndex];
  if (!sheet) return;
  const list = s.boxes.get(pageIndex) ?? [];
  sheet.layer.replaceChildren(
    ...list.map((b, i) => {
      const el = h(
        'div',
        { class: 'redact-box' },
        h('button', {
          type: 'button',
          class: 'sig-remove',
          'aria-label': `Remove box ${i + 1} on page ${pageIndex + 1}`,
          text: '×',
          onclick: (e) => {
            e.stopPropagation();
            list.splice(i, 1);
            drawBoxes(pageIndex);
            updateCount();
          },
        }),
      );
      el.style.left = `${b.x * 100}%`;
      el.style.top = `${b.y * 100}%`;
      el.style.width = `${b.w * 100}%`;
      el.style.height = `${b.h * 100}%`;
      return el;
    }),
  );
}

function updateCount() {
  const n = allBoxes();
  const pages = [...s.boxes.values()].filter((l) => l.length).length;
  s.els.count.textContent = n ? `${pluralize(n, 'area')} marked on ${pluralize(pages, 'page')}` : 'Nothing marked yet';
  s.ctx?.update();
}

function addBox(pageIndex, box) {
  if (!s.boxes.has(pageIndex)) s.boxes.set(pageIndex, []);
  s.boxes.get(pageIndex).push(box);
  drawBoxes(pageIndex);
}

function setupDrawing(pageIndex, layer) {
  let start = null;
  let temp = null;
  const frac = (e) => {
    const r = layer.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  layer.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sig-remove')) return;
    start = frac(e);
    layer.setPointerCapture(e.pointerId);
    temp = h('div', { class: 'redact-box temp' });
    layer.append(temp);
    e.preventDefault();
  });
  layer.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = frac(e);
    temp.style.left = `${Math.min(start.x, p.x) * 100}%`;
    temp.style.top = `${Math.min(start.y, p.y) * 100}%`;
    temp.style.width = `${Math.abs(p.x - start.x) * 100}%`;
    temp.style.height = `${Math.abs(p.y - start.y) * 100}%`;
  });
  layer.addEventListener('pointerup', (e) => {
    if (!start) return;
    const p = frac(e);
    temp?.remove();
    const box = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    start = null;
    if (box.w > 0.005 && box.h > 0.005) {
      addBox(pageIndex, box);
      updateCount();
      announce(`Area marked on page ${pageIndex + 1}.`);
    }
  });
}

/** Find every occurrence of the term and mark it. Returns how many were found. */
async function markText(term) {
  const needle = term.trim().toLowerCase();
  if (!needle) return 0;
  let found = 0;
  for (let p = 0; p < s.doc.numPages; p += 1) {
    const { items, width, height } = await textBoxes(s.doc, p + 1);
    for (const item of items) {
      const hay = item.str.toLowerCase();
      let at = hay.indexOf(needle);
      while (at !== -1) {
        const len = item.str.length || 1;
        const x = item.x + item.width * (at / len);
        const w = item.width * (needle.length / len);
        const padX = item.height * 0.15;
        addBox(p, {
          x: Math.max(0, (x - padX) / width),
          y: Math.max(0, (item.y - item.height * 0.1) / height),
          w: Math.min(1, (w + padX * 2) / width),
          h: Math.min(1, (item.height * 1.2) / height),
        });
        found += 1;
        at = hay.indexOf(needle, at + needle.length);
      }
    }
  }
  return found;
}

async function renderSheets(ctx) {
  for (let p = 0; p < s.doc.numPages; p += 1) {
    const sheet = s.sheets[p];
    if (!sheet || sheet.done) continue;
    const { canvas } = await renderPage(s.doc, p + 1, { width: 800 });
    sheet.img.src = canvas.toDataURL('image/jpeg', 0.82);
    sheet.done = true;
    await ctx.nextFrame();
  }
}

export default {
  setup(ctx) {
    s.ctx = ctx;
    const search = h('input', { type: 'search', id: 'redact-term', placeholder: 'e.g. a name, phone or ID number', autocomplete: 'off' });
    const count = h('p', { class: 'hint', 'aria-live': 'polite', text: 'Nothing marked yet' });
    const result = h('p', { class: 'hint', 'aria-live': 'polite' });
    const find = h('button', {
      type: 'button',
      class: 'btn',
      text: 'Find and mark',
      onclick: async () => {
        if (!s.doc) return;
        s.term = search.value;
        const n = await markText(search.value);
        result.textContent = n ? `Marked ${pluralize(n, 'match', 'matches')} of "${search.value.trim()}".` : `"${search.value.trim()}" wasn't found as text. If the page is a scan, draw a box over it.`;
        updateCount();
      },
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        find.click();
      }
    });
    const clear = h('button', {
      type: 'button',
      class: 'btn ghost',
      text: 'Clear all',
      onclick: () => {
        s.boxes.clear();
        s.sheets.forEach((_, i) => drawBoxes(i));
        updateCount();
      },
    });
    const pages = h('div', { class: 'redact-pages' });
    s.els = { search, count, pages };
    ctx.custom.replaceChildren(
      h('div', { class: 'field' }, h('label', { for: 'redact-term', text: 'Find text to hide' }), h('div', { class: 'row' }, search, find)),
      result,
      h('p', { class: 'hint', text: 'Or drag on a page to draw a black box. Click × to remove one.' }),
      h('div', { class: 'row' }, count, clear),
      pages,
    );
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    s.boxes.clear();
    if (!entry?.pageCount) {
      ctx.custom.hidden = true;
      return;
    }
    s.doc = await pdfOf(entry);
    s.sheets = Array.from({ length: s.doc.numPages }, (_, p) => {
      const img = h('img', { alt: `Page ${p + 1}`, class: 'sheet-img' });
      const layer = h('div', { class: 'redact-layer', role: 'group', 'aria-label': `Page ${p + 1}: drag to mark an area` });
      setupDrawing(p, layer);
      const sheet = h('div', { class: 'sheet' }, img, layer);
      return { img, layer, el: h('figure', { class: 'redact-page' }, sheet, h('figcaption', { text: `Page ${p + 1}` })), sheet };
    });
    // Size each sheet to its page before images load, so the layout doesn't jump.
    for (let p = 0; p < s.doc.numPages; p += 1) {
      const page = await s.doc.getPage(p + 1);
      const vp = page.getViewport({ scale: 1 });
      s.sheets[p].sheet.style.aspectRatio = `${vp.width} / ${vp.height}`;
    }
    s.els.pages.replaceChildren(...s.sheets.map((x) => x.el));
    ctx.custom.hidden = false;
    updateCount();
    renderSheets(ctx);
  },

  onClear(ctx) {
    s.boxes.clear();
    ctx.custom.hidden = true;
  },

  ready() {
    return allBoxes() ? true : 'Find text or draw a box over what you want to hide.';
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const pages = [...s.boxes.entries()].filter(([, list]) => list.length).sort((a, b) => a[0] - b[0]);
    const replacements = [];
    for (let k = 0; k < pages.length; k += 1) {
      const [index, list] = pages[k];
      ctx.progress((k / pages.length) * 0.8, `Redacting page ${index + 1}…`);
      const { canvas, base } = await renderPage(s.doc, index + 1, { scale: DPI / 72 });
      const g = canvas.getContext('2d');
      g.fillStyle = '#000';
      for (const b of list) {
        g.fillRect(Math.floor(b.x * canvas.width), Math.floor(b.y * canvas.height), Math.ceil(b.w * canvas.width) + 1, Math.ceil(b.h * canvas.height) + 1);
      }
      const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.88);
      canvas.width = 0;
      canvas.height = 0;
      replacements.push({ index, bytes, width: base.width, height: base.height });
    }
    ctx.progress(0.85, 'Removing hidden content…');
    const bytes = await copyBytes(entry);
    const out = await ctx.engine.run('replacePages', { bytes, replacements, options: { stripMetadata: true } }, [bytes.buffer, ...replacements.map((r) => r.bytes.buffer)]);

    // Check the result: redacted pages must have no text left, and the search term must be gone.
    ctx.progress(0.95, 'Checking the result…');
    const check = await openPdf(out);
    const notes = [];
    for (const [index] of pages) {
      if ((await pageText(check, index + 1)).trim()) notes.push({ tone: 'warn', text: `Page ${index + 1} still has text. Please report this.` });
    }
    if (s.term.trim()) {
      const needle = s.term.trim().toLowerCase();
      const left = [];
      for (let p = 1; p <= check.numPages; p += 1) if ((await pageText(check, p)).toLowerCase().includes(needle)) left.push(p);
      if (left.length) notes.push({ tone: 'warn', text: `"${s.term.trim()}" still appears on page ${left.join(', ')}, because a box there was removed.` });
    }
    await check.destroy();
    if (!notes.length) notes.push({ tone: 'info', text: 'Checked: the marked content is gone from the file, not just covered.' });
    notes.push({ tone: 'info', text: 'Redacted pages are now images, so their text can’t be selected. Links, bookmarks, form fields and metadata were removed so nothing hidden can leak.' });
    return {
      title: 'Your redacted PDF is ready',
      summary: `${pluralize(allBoxes(), 'area')} blacked out on ${pluralize(pages.length, 'page')}.`,
      notes,
      files: [pdfFile(outName(entry, 'redacted'), out)],
    };
  },
};
