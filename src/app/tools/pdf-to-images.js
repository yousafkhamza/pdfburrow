import { baseName, pluralize } from '../core/format.js';
import { pdfOf } from '../files.js';
import { canvasToBytes, renderPage } from '../render.js';
import { pagesOption, pagesProblem } from './common.js';

export default {
  ready(ctx) {
    const count = ctx.entries[0]?.pageCount;
    return count ? pagesProblem(ctx.options.pages, count) : true;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const doc = await pdfOf(entry);
    const pages = pagesOption(ctx.options.pages, doc.numPages) ?? Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const png = ctx.options.format === 'png';
    const dpi = Number(ctx.options.dpi) || 150;
    const files = [];
    const width = String(Math.max(...pages)).length;
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i];
      ctx.progress(i / pages.length, `Page ${p} of ${doc.numPages}…`);
      const { canvas } = await renderPage(doc, p, { scale: dpi / 72 });
      const bytes = await canvasToBytes(canvas, png ? 'image/png' : 'image/jpeg', 0.9);
      canvas.width = 0;
      canvas.height = 0;
      const n = String(p).padStart(width, '0');
      files.push({ name: `${baseName(entry.name)}-page-${n}.${png ? 'png' : 'jpg'}`, blob: new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }) });
      await ctx.nextFrame();
    }
    return {
      title: files.length === 1 ? 'Your image is ready' : `${files.length} images are ready`,
      summary: `${pluralize(files.length, 'page')} saved as ${png ? 'PNG' : 'JPG'} at ${dpi} dpi.`,
      files,
      zipName: `${baseName(entry.name)}-images.zip`,
    };
  },
};
