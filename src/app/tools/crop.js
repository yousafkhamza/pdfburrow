import { mm, PAGE_SIZES } from '../core/layout.js';
import { pdfOf } from '../files.js';
import { renderPage } from '../render.js';
import { h } from '../ui.js';
import { copyBytes, outName, pagesOption, pagesProblem, pdfFile } from './common.js';

let preview = null; // { box, canvasWidth, base }

function drawOverlay(ctx) {
  if (!preview) return;
  const o = ctx.options;
  const show = o.mode === 'crop';
  preview.shade.hidden = !show;
  if (!show) return;
  const { base } = preview;
  const pct = (v, total) => `${Math.max(0, Math.min(100, (mm(v) / total) * 100))}%`;
  const s = preview.shade.style;
  s.top = pct(o.top, base.height);
  s.bottom = pct(o.bottom, base.height);
  s.left = pct(o.left, base.width);
  s.right = pct(o.right, base.width);
}

export default {
  setup(ctx) {
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    if (!entry?.pageCount) {
      ctx.custom.hidden = true;
      return;
    }
    const { canvas, base } = await renderPage(await pdfOf(entry), 1, { width: 320 });
    const shade = h('span', { class: 'crop-box', 'aria-hidden': 'true' });
    canvas.className = 'crop-page';
    ctx.custom.replaceChildren(
      h('p', { class: 'hint', text: 'Preview of page 1. The clear area is what stays.' }),
      h('div', { class: 'crop-preview' }, canvas, shade),
    );
    preview = { shade, base };
    ctx.custom.hidden = false;
    drawOverlay(ctx);
  },

  onOptions(ctx) {
    drawOverlay(ctx);
  },

  onClear(ctx) {
    preview = null;
    ctx.custom.hidden = true;
  },

  ready(ctx) {
    const o = ctx.options;
    if (o.mode !== 'crop') return true;
    if (!o.top && !o.bottom && !o.left && !o.right) return 'Set at least one margin to crop.';
    const count = ctx.entries[0]?.pageCount;
    if (preview) {
      const { base } = preview;
      if (mm(o.left + o.right) >= base.width - 10 || mm(o.top + o.bottom) >= base.height - 10) return 'Those margins would remove the whole page.';
    }
    return count ? pagesProblem(o.pages, count) : true;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const o = ctx.options;
    const bytes = await copyBytes(entry);
    if (o.mode === 'resize') {
      ctx.progress(0.3, `Fitting pages to ${PAGE_SIZES[o.size]?.label ?? o.size}…`);
      const out = await ctx.engine.run('resize', { bytes, options: { size: o.size } }, [bytes.buffer]);
      return {
        title: 'Your PDF is ready',
        summary: `Every page is now ${PAGE_SIZES[o.size]?.label ?? o.size}, scaled to fit.`,
        files: [pdfFile(outName(entry, o.size), out)],
      };
    }
    const pages = pagesOption(o.pages, entry.pageCount);
    ctx.progress(0.3, 'Cropping…');
    const out = await ctx.engine.run(
      'crop',
      { bytes, options: { margins: { top: mm(o.top), right: mm(o.right), bottom: mm(o.bottom), left: mm(o.left) }, pages } },
      [bytes.buffer],
    );
    return {
      title: 'Your cropped PDF is ready',
      summary: `${pages ? `${pages.length} of ${entry.pageCount}` : 'All'} pages cropped.`,
      files: [pdfFile(outName(entry, 'cropped'), out)],
    };
  },
};
