import { baseName, pluralize } from '../core/format.js';
import { chunkPages, describePages, parseRanges } from '../core/ranges.js';
import { pdfFile, copyBytes, inputError } from './common.js';

function groupsFor(options, count) {
  if (options.mode === 'each') return chunkPages(count, 1);
  if (options.mode === 'every') return chunkPages(count, options.every);
  if (!String(options.ranges).trim()) throw inputError('Type the pages you want, for example 1-3, 5.');
  const r = parseRanges(options.ranges, count);
  if (r.error) throw inputError(r.error);
  return options.mode === 'extract' ? [r.pages] : r.groups;
}

let lastSuggestion = '';

export default {
  onFiles(ctx) {
    const count = ctx.entries[0]?.pageCount;
    if (!count) return;
    // Suggest a useful split for this file (two halves), unless the person already typed ranges.
    const current = ctx.options.ranges.trim();
    if (current && current !== lastSuggestion) return;
    const half = Math.ceil(count / 2);
    lastSuggestion = count > 1 ? `1-${half}, ${half + 1}-end` : '1';
    ctx.setOption('ranges', lastSuggestion);
  },

  ready(ctx) {
    const count = ctx.entries[0]?.pageCount;
    if (!count) return true;
    const o = ctx.options;
    if (o.mode !== 'extract' && count < 2) return 'This PDF has only one page, so there is nothing to split.';
    try {
      groupsFor(o, count);
      return true;
    } catch (error) {
      return error.message;
    }
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const count = entry.pageCount;
    const groups = groupsFor(ctx.options, count);
    ctx.progress(0.3, `Creating ${pluralize(groups.length, 'file')}…`);
    const bytes = await copyBytes(entry);
    const outputs = await ctx.engine.run('split', { bytes, groups }, [bytes.buffer]);
    const base = baseName(entry.name);
    const files = outputs.map((b, i) => {
      const label = describePages(groups[i]).replace(/, /g, '_').slice(0, 40);
      return pdfFile(`${base}-${groups[i].length === 1 ? 'page' : 'pages'}-${label}`, b);
    });
    return {
      title: files.length === 1 ? 'Your new PDF is ready' : `${files.length} PDFs are ready`,
      summary:
        ctx.options.mode === 'extract'
          ? `Pages ${describePages(groups[0])} saved as a new ${pluralize(groups[0].length, 'page')} PDF.`
          : `${pluralize(count, 'page')} split into ${pluralize(files.length, 'file')}.`,
      files,
      zipName: `${base}-split.zip`,
    };
  },
};
