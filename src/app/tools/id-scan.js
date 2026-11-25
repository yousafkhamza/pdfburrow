import { baseName } from '../core/format.js';
import { imageForPdf } from '../files.js';
import { pdfFile } from './common.js';

export default {
  async run(ctx) {
    const images = [];
    for (let i = 0; i < Math.min(2, ctx.entries.length); i += 1) {
      ctx.progress(i * 0.4, `Preparing the ${i === 0 ? 'front' : 'back'}…`);
      const img = await imageForPdf(ctx.entries[i]);
      images.push({ ...img, bytes: img.bytes.slice() });
    }
    ctx.progress(0.85, 'Placing on the page…');
    const { pageSize, card } = ctx.options;
    const bytes = await ctx.engine.run('idScan', { images, options: { pageSize, card } }, images.map((i) => i.bytes.buffer));
    return {
      title: 'Your PDF is ready',
      summary: images.length === 2 ? 'Front and back on one page, ready to print or upload.' : 'The front is on the page. Add a second photo for the back.',
      files: [pdfFile(`${baseName(ctx.entries[0].name)}-front-back`, bytes)],
    };
  },
};
