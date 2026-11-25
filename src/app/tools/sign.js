import { pdfOf } from '../files.js';
import { canvasToBytes, renderPage } from '../render.js';
import { announce, h } from '../ui.js';
import { copyBytes, outName, pdfFile } from './common.js';

const FONTS = ['Caveat', 'Dancing Script', 'Great Vibes'];
const INKS = { black: '#111827', blue: '#1d3fbf' };

const s = {
  tab: 'draw',
  ink: 'black',
  sig: null, // { bytes, width, height, url }
  placements: [], // { page: 0-based, x, y, w } — fractions of the page, top-left origin
  page: 0,
  pages: [], // { url, base }
  size: 0.3,
  els: {},
};

// ---------- making the signature image ----------

/** Crop a canvas to its non-transparent pixels, with a little padding. */
function trim(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext('2d').drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function setSignature(canvas) {
  const trimmed = canvas ? trim(canvas) : null;
  if (!trimmed) {
    s.sig = null;
  } else {
    const bytes = await canvasToBytes(trimmed, 'image/png');
    s.sig = { bytes, width: trimmed.width, height: trimmed.height, url: trimmed.toDataURL('image/png') };
  }
  renderBoxes();
  s.ctx?.update();
}

function typedCanvas() {
  const name = s.els.name.value.trim();
  if (!name) return null;
  const font = `110px "${s.els.font.value}", cursive`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const width = Math.ceil(probe.measureText(name).width) + 40;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, 3000);
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = INKS[s.ink];
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, 92);
  return canvas;
}

async function uploadedCanvas(file, removeBackground) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (removeBackground) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (light > 200) d[i + 3] = 0;
      else if (light > 150) d[i + 3] = Math.round(d[i + 3] * ((200 - light) / 50));
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

function setupPad(pad) {
  const ctx = pad.getContext('2d');
  let drawing = false;
  let last = null;
  const point = (e) => {
    const r = pad.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
  };
  pad.addEventListener('pointerdown', (e) => {
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    last = point(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = INKS[s.ink];
    ctx.fill();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = point(e);
    ctx.strokeStyle = INKS[s.ink];
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    setSignature(pad);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}

// ---------- placing it on pages ----------

function renderBoxes() {
  const layer = s.els.layer;
  if (!layer) return;
  layer.replaceChildren(
    ...s.placements
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.page === s.page)
      .map(({ p, i }) => {
        const box = h(
          'div',
          { class: 'sig-box', tabindex: '0', role: 'img', 'aria-label': `Signature ${i + 1}. Use arrow keys to move, Delete to remove.`, dataset: { index: String(i) } },
          s.sig ? h('img', { src: s.sig.url, alt: '' }) : null,
          h('button', { type: 'button', class: 'sig-remove', 'aria-label': 'Remove this signature', text: '×', onclick: (e) => { e.stopPropagation(); removePlacement(i); } }),
        );
        box.style.left = `${p.x * 100}%`;
        box.style.top = `${p.y * 100}%`;
        box.style.width = `${p.w * 100}%`;
        if (s.sig) box.style.aspectRatio = `${s.sig.width} / ${s.sig.height}`;
        return box;
      }),
  );
  s.els.count.textContent = s.placements.length ? `${s.placements.length} placed` : '';
  s.ctx?.update();
}

function removePlacement(i) {
  s.placements.splice(i, 1);
  renderBoxes();
  announce('Signature removed.');
}

function aspect() {
  return s.sig ? s.sig.height / s.sig.width : 0.35;
}

function place(xFrac, yFrac) {
  if (!s.sig) {
    announce('Make your signature first.');
    s.els.makerHint.classList.add('flash');
    setTimeout(() => s.els.makerHint.classList.remove('flash'), 1200);
    return;
  }
  const page = s.pages[s.page];
  const w = s.size;
  const hFrac = (w * aspect() * page.base.width) / page.base.height;
  s.placements.push({
    page: s.page,
    x: Math.max(0, Math.min(1 - w, xFrac - w / 2)),
    y: Math.max(0, Math.min(1 - hFrac, yFrac - hFrac / 2)),
    w,
  });
  renderBoxes();
  announce('Signature placed. Drag it, or use the arrow keys, to adjust.');
}

async function showPage(index) {
  s.page = Math.max(0, Math.min(s.pages.length - 1, index));
  const page = s.pages[s.page];
  if (!page.url) {
    const { canvas, base } = await renderPage(s.doc, s.page + 1, { width: 900 });
    page.url = canvas.toDataURL('image/jpeg', 0.85);
    page.base = base;
  }
  s.els.sheetImg.src = page.url;
  s.els.sheet.style.aspectRatio = `${page.base.width} / ${page.base.height}`;
  s.els.pager.textContent = `Page ${s.page + 1} of ${s.pages.length}`;
  s.els.prev.disabled = s.page === 0;
  s.els.next.disabled = s.page === s.pages.length - 1;
  renderBoxes();
}

function setupLayer(layer) {
  let drag = null;
  layer.addEventListener('pointerdown', (e) => {
    const box = e.target.closest('.sig-box');
    const r = layer.getBoundingClientRect();
    if (box && !e.target.closest('.sig-remove')) {
      const i = Number(box.dataset.index);
      drag = { i, dx: (e.clientX - r.left) / r.width - s.placements[i].x, dy: (e.clientY - r.top) / r.height - s.placements[i].y };
      layer.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  layer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = layer.getBoundingClientRect();
    const p = s.placements[drag.i];
    const page = s.pages[p.page];
    const hFrac = (p.w * aspect() * page.base.width) / page.base.height;
    p.x = Math.max(0, Math.min(1 - p.w, (e.clientX - r.left) / r.width - drag.dx));
    p.y = Math.max(0, Math.min(1 - hFrac, (e.clientY - r.top) / r.height - drag.dy));
    const el = layer.querySelector(`[data-index="${drag.i}"]`);
    if (el) {
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
    }
  });
  layer.addEventListener('pointerup', (e) => {
    if (drag) {
      drag = null;
      return;
    }
    if (e.target.closest('.sig-box')) return;
    const r = layer.getBoundingClientRect();
    place((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  layer.addEventListener('keydown', (e) => {
    const box = e.target.closest('.sig-box');
    if (!box) return;
    const i = Number(box.dataset.index);
    const p = s.placements[i];
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      p.x = Math.max(0, Math.min(1 - p.w, p.x + moves[e.key][0]));
      p.y = Math.max(0, Math.min(1, p.y + moves[e.key][1]));
      renderBoxes();
      layer.querySelector(`[data-index="${i}"]`)?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removePlacement(i);
    }
  });
}

function tabButton(id, text) {
  return h('button', {
    type: 'button',
    role: 'tab',
    class: 'tab',
    id: `sig-tab-${id}`,
    'aria-selected': String(s.tab === id),
    'aria-controls': `sig-panel-${id}`,
    text,
    onclick: () => selectTab(id),
  });
}

function selectTab(id) {
  s.tab = id;
  for (const t of ['draw', 'type', 'upload']) {
    s.els[`tab-${t}`].setAttribute('aria-selected', String(t === id));
    s.els[`panel-${t}`].hidden = t !== id;
  }
  refreshSignature();
}

async function refreshSignature() {
  if (s.tab === 'draw') await setSignature(s.els.pad);
  else if (s.tab === 'type') {
    await document.fonts?.load?.(`110px "${s.els.font.value}"`).catch(() => {});
    await setSignature(typedCanvas());
    s.els.typePreview.style.fontFamily = `"${s.els.font.value}", cursive`;
    s.els.typePreview.style.color = INKS[s.ink];
    s.els.typePreview.textContent = s.els.name.value || 'Your name';
  } else if (s.els.upload.files?.[0]) {
    try {
      await setSignature(await uploadedCanvas(s.els.upload.files[0], s.els.removeBg.checked));
    } catch {
      s.sig = null;
      announce('That image could not be read.');
    }
  } else await setSignature(null);
}

export default {
  setup(ctx) {
    s.ctx = ctx;
    const pad = h('canvas', { class: 'pad', width: 900, height: 300, role: 'img', 'aria-label': 'Signature pad. Draw with your mouse, finger or pen.' });
    setupPad(pad);
    const name = h('input', { type: 'text', id: 'sig-name', autocomplete: 'name', placeholder: 'Your full name', oninput: () => refreshSignature() });
    const font = h('select', { id: 'sig-font', onchange: () => refreshSignature() }, FONTS.map((f) => h('option', { value: f, text: f })));
    const upload = h('input', { type: 'file', id: 'sig-upload', accept: 'image/*', onchange: () => refreshSignature() });
    const removeBg = h('input', { type: 'checkbox', id: 'sig-bg', checked: true, onchange: () => refreshSignature() });
    const ink = h(
      'select',
      { id: 'sig-ink', 'aria-label': 'Ink colour', onchange: (e) => { s.ink = e.target.value; refreshSignature(); } },
      h('option', { value: 'black', text: 'Black ink' }),
      h('option', { value: 'blue', text: 'Blue ink' }),
    );
    const typePreview = h('p', { class: 'type-preview', 'aria-hidden': 'true', text: 'Your name' });
    const layer = h('div', { class: 'sig-layer' });
    setupLayer(layer);
    const sheetImg = h('img', { alt: 'Page preview', class: 'sheet-img' });
    const sheet = h('div', { class: 'sheet' }, sheetImg, layer);
    const pager = h('span', { class: 'pager-text', 'aria-live': 'polite' });
    const prev = h('button', { type: 'button', class: 'btn', text: '‹ Previous', onclick: () => showPage(s.page - 1) });
    const next = h('button', { type: 'button', class: 'btn', text: 'Next ›', onclick: () => showPage(s.page + 1) });
    const size = h('input', {
      type: 'range',
      id: 'sig-size',
      min: '10',
      max: '60',
      value: '30',
      oninput: (e) => {
        s.size = Number(e.target.value) / 100;
        for (const p of s.placements) p.w = s.size;
        renderBoxes();
      },
    });
    const date = h('input', { type: 'checkbox', id: 'sig-date' });
    const count = h('span', { class: 'hint', 'aria-live': 'polite' });
    const makerHint = h('p', { class: 'hint', text: 'Then click on the page where your signature goes.' });

    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'How to make your signature' }, tabButton('draw', 'Draw'), tabButton('type', 'Type'), tabButton('upload', 'Upload'));
    s.els = {
      pad, name, font, upload, removeBg, typePreview, layer, sheet, sheetImg, pager, prev, next, count, makerHint, date,
      'tab-draw': tabs.children[0], 'tab-type': tabs.children[1], 'tab-upload': tabs.children[2],
      'panel-draw': h('div', { class: 'sig-panel', id: 'sig-panel-draw', role: 'tabpanel', 'aria-labelledby': 'sig-tab-draw' }, pad, h('div', { class: 'row' }, ink, h('button', { type: 'button', class: 'btn ghost', text: 'Clear', onclick: () => { pad.getContext('2d').clearRect(0, 0, pad.width, pad.height); setSignature(null); } }))),
      'panel-type': h('div', { class: 'sig-panel', id: 'sig-panel-type', role: 'tabpanel', 'aria-labelledby': 'sig-tab-type', hidden: true },
        h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', { for: 'sig-name', text: 'Your name' }), name), h('div', { class: 'field' }, h('label', { for: 'sig-font', text: 'Style' }), font)),
        typePreview),
      'panel-upload': h('div', { class: 'sig-panel', id: 'sig-panel-upload', role: 'tabpanel', 'aria-labelledby': 'sig-tab-upload', hidden: true },
        h('div', { class: 'field' }, h('label', { for: 'sig-upload', text: 'Photo or scan of your signature' }), upload),
        h('div', { class: 'field check' }, removeBg, h('label', { for: 'sig-bg', text: 'Remove the white paper background' }))),
    };
    ctx.custom.replaceChildren(
      h(
        'div',
        { class: 'sign' },
        h('section', { class: 'sig-maker', 'aria-labelledby': 'sig-h1' }, h('h3', { id: 'sig-h1', class: 'panel-title', text: '1. Make your signature' }), tabs, s.els['panel-draw'], s.els['panel-type'], s.els['panel-upload'], makerHint),
        h(
          'section',
          { class: 'sig-place', 'aria-labelledby': 'sig-h2' },
          h('h3', { id: 'sig-h2', class: 'panel-title', text: '2. Place it on the page' }),
          h('div', { class: 'pager' }, prev, pager, next),
          sheet,
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', text: 'Place in the centre', onclick: () => place(0.5, 0.75) }), count),
          h('div', { class: 'field' }, h('label', { for: 'sig-size', text: 'Signature size' }), size),
          h('div', { class: 'field check' }, date, h('label', { for: 'sig-date', text: 'Add today’s date under the signature' })),
        ),
      ),
    );
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    s.placements = [];
    if (!entry?.pageCount) {
      ctx.custom.hidden = true;
      return;
    }
    s.doc = await pdfOf(entry);
    s.pages = Array.from({ length: s.doc.numPages }, () => ({ url: null, base: null }));
    ctx.custom.hidden = false;
    await showPage(0);
  },

  onClear(ctx) {
    s.placements = [];
    ctx.custom.hidden = true;
  },

  ready() {
    if (!s.sig) return 'Draw, type or upload your signature.';
    if (!s.placements.length) return 'Click on the page where your signature goes.';
    return true;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    ctx.progress(0.2, 'Preparing pages…');
    // Page sizes for every page that has a signature.
    for (const p of s.placements) {
      if (!s.pages[p.page].base) {
        const page = await s.doc.getPage(p.page + 1);
        s.pages[p.page].base = page.getViewport({ scale: 1 });
      }
    }
    const placements = [];
    const texts = [];
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    for (const p of s.placements) {
      const { width: W, height: H } = s.pages[p.page].base;
      const width = p.w * W;
      const height = width * aspect();
      const x = p.x * W;
      const y = H - p.y * H - height;
      placements.push({ page: p.page, image: 0, x, y, width, height });
      if (s.els.date.checked) texts.push({ page: p.page, text: today, x: x + 4, y: Math.max(4, y - 11), size: 9 });
    }
    ctx.progress(0.5, 'Signing…');
    const bytes = await copyBytes(entry);
    const sig = s.sig.bytes.slice();
    const out = await ctx.engine.run('stamp', { bytes, options: { images: [{ bytes: sig, format: 'png' }], placements, texts } }, [bytes.buffer, sig.buffer]);
    return {
      title: 'Your signed PDF is ready',
      summary: `Signature added in ${placements.length} place${placements.length === 1 ? '' : 's'}.`,
      notes: [{ tone: 'info', text: 'This is a picture of your signature, like signing on paper. It is not a certificate-based digital signature.' }],
      files: [pdfFile(outName(entry, 'signed'), out)],
    };
  },
};
