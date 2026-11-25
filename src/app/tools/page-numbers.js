import { pluralize } from '../core/format.js';
import { copyBytes, outName, pdfFile } from './common.js';

export default {
  async run(ctx) {
    const entry = ctx.entries[0];
    const o = ctx.options;
    ctx.progress(0.3, 'Adding page numbers…');
    const bytes = await copyBytes(entry);
    const out = await ctx.engine.run(
      'pageNumbers',
      {
        bytes,
        options: { position: o.position, format: o.format, start: o.start, skipFirst: o.skipFirst, fontSize: Number(o.fontSize) || 11 },
      },
      [bytes.buffer],
    );
    const numbered = (entry.pageCount || 0) - (o.skipFirst ? 1 : 0);
    return {
      title: 'Page numbers added',
      summary: numbered > 0 ? `${pluralize(numbered, 'page')} numbered, starting at ${o.start}.` : 'Page numbers added.',
      files: [pdfFile(outName(entry, 'numbered'), out)],
    };
  },
};
