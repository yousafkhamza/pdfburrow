import { baseName, pluralize } from '../core/format.js';
import { mm } from '../core/layout.js';
import { imageForPdf } from '../files.js';
import { pdfFile } from './common.js';

export default {
  async run(ctx) {
    const images = [];
    for (let i = 0; i < ctx.entries.length; i += 1) {
      const e = ctx.entries[i];
      ctx.progress((i / ctx.entries.length) * 0.7, `Preparing ${e.name}…`);
      const img = await imageForPdf(e);
      images.push({ ...img, bytes: img.bytes.slice() });
      await ctx.nextFrame();
    }
    ctx.progress(0.8, 'Building the PDF…');
    const { size, orientation, margin } = ctx.options;
    const bytes = await ctx.engine.run(
      'imagesToPdf',
      { images, options: { size, orientation, margin: mm(Number(margin) || 0) } },
      images.map((i) => i.bytes.buffer),
    );
    const n = ctx.entries.length;
    return {
      title: 'Your PDF is ready',
      summary: `${pluralize(n, 'image')} turned into a ${pluralize(n, 'page')} PDF.`,
      files: [pdfFile(n === 1 ? baseName(ctx.entries[0].name) : `${baseName(ctx.entries[0].name)}-and-${n - 1}-more`, bytes)],
    };
  },
};
