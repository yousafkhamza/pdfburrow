import { baseName, pluralize } from '../core/format.js';
import { bytesOf, imageForPdf } from '../files.js';
import { pdfFile } from './common.js';

export default {
  async run(ctx) {
    const entries = ctx.entries;
    const items = [];
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      ctx.progress((i / entries.length) * 0.5, `Reading ${e.name}…`);
      if (e.kind === 'pdf') items.push({ kind: 'pdf', bytes: (await bytesOf(e)).slice() });
      else {
        const img = await imageForPdf(e);
        items.push({ kind: 'image', ...img, bytes: img.bytes.slice() });
      }
    }
    ctx.progress(0.6, `Merging ${pluralize(entries.length, 'file')}…`);
    const bytes = await ctx.engine.run(
      'merge',
      { items, options: { imageSize: ctx.options.imageSize } },
      items.map((it) => it.bytes.buffer),
    );
    const pages = entries.reduce((n, e) => n + (e.kind === 'pdf' ? e.pageCount || 0 : 1), 0);
    return {
      title: 'Your merged PDF is ready',
      summary: `${pluralize(entries.length, 'file')} combined into one ${pages ? `${pluralize(pages, 'page')} ` : ''}PDF.`,
      files: [pdfFile(`${baseName(entries[0].name)}-merged`, bytes)],
    };
  },
};
