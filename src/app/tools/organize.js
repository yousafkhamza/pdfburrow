import { pluralize } from '../core/format.js';
import { pdfOf } from '../files.js';
import { renderPage } from '../render.js';
import { h, announce } from '../ui.js';
import { copyBytes, outName, pdfFile } from './common.js';

let plan = [];
let thumbs = new Map(); // source index -> data URL
let grid = null;
let dragFrom = null;

function label(step, i) {
  return step.blank ? `Blank page (position ${i + 1})` : `Page ${step.source + 1} (position ${i + 1})`;
}

function render(ctx) {
  if (!grid) return;
  grid.replaceChildren(
    ...plan.map((step, i) => {
      const img = step.blank
        ? h('span', { class: 'page-blank', text: 'Blank' })
        : thumbs.get(step.source)
          ? h('img', { src: thumbs.get(step.source), alt: '' })
          : h('span', { class: 'page-loading', 'aria-hidden': 'true' });
      const frame = h('span', { class: 'page-frame' }, img);
      frame.style.transform = `rotate(${step.rotate || 0}deg)`;
      const act = (text, aria, fn, disabled = false) =>
        h('button', { type: 'button', class: 'icon', 'aria-label': `${aria}: ${label(step, i)}`, title: aria, onclick: fn, disabled, text });
      return h(
        'li',
        { class: 'page-card', draggable: 'true', dataset: { index: String(i) } },
        frame,
        h('span', { class: 'page-no', text: step.blank ? 'Blank' : String(step.source + 1) }),
        h(
          'span',
          { class: 'page-actions' },
          act('←', 'Move earlier', () => moveStep(ctx, i, -1), i === 0),
          act('⟲', 'Rotate left', () => rotate(ctx, i, -90), !!step.blank),
          act('⟳', 'Rotate right', () => rotate(ctx, i, 90), !!step.blank),
          act('⧉', 'Duplicate', () => duplicate(ctx, i)),
          act('🗑', 'Delete', () => remove(ctx, i)),
          act('→', 'Move later', () => moveStep(ctx, i, 1), i === plan.length - 1),
        ),
      );
    }),
  );
  ctx.custom.querySelector('.org-count').textContent = `${pluralize(plan.length, 'page')} in the new PDF`;
  ctx.update();
}

function moveStep(ctx, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= plan.length) return;
  [plan[i], plan[j]] = [plan[j], plan[i]];
  render(ctx);
  grid.children[j]?.querySelector(`[aria-label^="${delta < 0 ? 'Move earlier' : 'Move later'}"]`)?.focus();
  announce(`Moved to position ${j + 1}.`);
}
function rotate(ctx, i, deg) {
  plan[i] = { ...plan[i], rotate: (((plan[i].rotate || 0) + deg) % 360 + 360) % 360 };
  render(ctx);
}
function duplicate(ctx, i) {
  plan.splice(i + 1, 0, { ...plan[i] });
  render(ctx);
}
function remove(ctx, i) {
  plan.splice(i, 1);
  render(ctx);
  announce(`Page removed. ${pluralize(plan.length, 'page')} left.`);
}

async function loadThumbs(ctx, entry) {
  const doc = await pdfOf(entry);
  for (let p = 1; p <= doc.numPages; p += 1) {
    if (ctx.entries[0] !== entry) return; // file changed
    const { canvas } = await renderPage(doc, p, { width: 160 });
    thumbs.set(p - 1, canvas.toDataURL('image/jpeg', 0.75));
    const card = grid?.querySelectorAll('.page-card');
    plan.forEach((step, i) => {
      if (step.source === p - 1 && card?.[i]) {
        const frame = card[i].querySelector('.page-frame');
        frame.replaceChildren(h('img', { src: thumbs.get(p - 1), alt: '' }));
      }
    });
    await ctx.nextFrame();
  }
}

export default {
  setup(ctx) {
    grid = h('ol', { class: 'page-grid', 'aria-label': 'Pages' });
    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.page-card');
      if (!card) return;
      dragFrom = Number(card.dataset.index);
      card.classList.add('dragging');
      try {
        e.dataTransfer.setData('text/plain', card.dataset.index);
      } catch {
        /* ignore */
      }
    });
    grid.addEventListener('dragover', (e) => {
      if (dragFrom !== null) e.preventDefault();
    });
    grid.addEventListener('drop', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.stopPropagation();
      const card = e.target.closest('.page-card');
      if (card) {
        const to = Number(card.dataset.index);
        const [moved] = plan.splice(dragFrom, 1);
        plan.splice(to, 0, moved);
        render(ctx);
      }
      dragFrom = null;
    });
    grid.addEventListener('dragend', () => {
      dragFrom = null;
      grid.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    });
    ctx.custom.replaceChildren(
      h(
        'div',
        { class: 'org-bar' },
        h('span', { class: 'org-count', 'aria-live': 'polite' }),
        h('button', { type: 'button', class: 'btn', text: '+ Blank page', onclick: () => { plan.push({ blank: true }); render(ctx); } }),
        h('button', { type: 'button', class: 'btn', text: 'Reverse order', onclick: () => { plan.reverse(); render(ctx); } }),
        h('button', { type: 'button', class: 'btn ghost', text: 'Undo all changes', onclick: () => { reset(ctx); } }),
      ),
      h('p', { class: 'hint', text: 'Drag pages to reorder them, or use the arrow buttons.' }),
      grid,
    );
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    if (!entry?.pageCount) {
      ctx.custom.hidden = true;
      return;
    }
    thumbs = new Map();
    reset(ctx);
    ctx.custom.hidden = false;
    loadThumbs(ctx, entry);
  },

  onClear(ctx) {
    plan = [];
    ctx.custom.hidden = true;
  },

  ready() {
    return plan.length ? true : 'Keep at least one page.';
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    ctx.progress(0.3, 'Saving your changes…');
    const bytes = await copyBytes(entry);
    const out = await ctx.engine.run('organize', { bytes, plan: plan.map((s) => ({ ...s })) }, [bytes.buffer]);
    return {
      title: 'Your PDF is ready',
      summary: `${pluralize(plan.length, 'page')} in the new order.`,
      files: [pdfFile(outName(entry, 'organized'), out)],
    };
  },
};

function reset(ctx) {
  const count = ctx.entries[0]?.pageCount ?? 0;
  plan = Array.from({ length: count }, (_, i) => ({ source: i, rotate: 0 }));
  render(ctx);
}
