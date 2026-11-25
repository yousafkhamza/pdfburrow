import { bytesOf } from '../files.js';
import { h } from '../ui.js';
import { outName, pdfFile } from './common.js';

const LABELS = {
  title: 'Title',
  author: 'Author',
  subject: 'Subject',
  keywords: 'Keywords',
  creator: 'Created with',
  producer: 'PDF made by',
  created: 'Created on',
  modified: 'Last changed',
};

function formatValue(key, value) {
  if (!value) return null;
  if (key === 'created' || key === 'modified') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
  return value;
}

async function read(ctx, entry) {
  const bytes = (await bytesOf(entry)).slice();
  return ctx.engine.run('readMetadata', { bytes }, [bytes.buffer]);
}

function table(meta) {
  const rows = Object.keys(LABELS)
    .map((k) => [LABELS[k], formatValue(k, meta[k])])
    .filter(([, v]) => v);
  if (meta.hasXmp) rows.push(['Hidden XMP data', 'Yes']);
  if (!rows.length) return h('p', { class: 'alert info', text: 'This PDF has no metadata. It is already clean.' });
  return h(
    'div',
    { class: 'table-wrap' },
    h('table', { class: 'meta-table' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { text: v }))))),
  );
}

export default {
  setup(ctx) {
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    if (!entry || entry.locked || entry.broken) {
      ctx.custom.hidden = true;
      return;
    }
    try {
      const meta = await read(ctx, entry);
      ctx.custom.replaceChildren(
        h('h3', { class: 'panel-title', text: ctx.entries.length > 1 ? `What "${entry.name}" says about itself` : 'What this PDF says about itself' }),
        table(meta),
      );
      ctx.custom.hidden = false;
      // Pre-fill the edit fields with the current values.
      for (const key of ['title', 'author', 'subject', 'keywords']) ctx.setOption(key, meta[key] ?? '');
    } catch {
      ctx.custom.hidden = true;
    }
  },

  onClear(ctx) {
    ctx.custom.hidden = true;
  },

  async run(ctx) {
    const o = ctx.options;
    const files = [];
    for (let i = 0; i < ctx.entries.length; i += 1) {
      const entry = ctx.entries[i];
      ctx.progress(i / ctx.entries.length, `Cleaning ${entry.name}…`);
      const bytes = (await bytesOf(entry)).slice();
      const out = await ctx.engine.run(
        'writeMetadata',
        { bytes, options: { mode: o.mode, values: { title: o.title, author: o.author, subject: o.subject, keywords: o.keywords } } },
        [bytes.buffer],
      );
      files.push(pdfFile(outName(entry, o.mode === 'remove' ? 'clean' : 'edited'), out));
    }
    // Check the result, so people can see it worked.
    let check = null;
    if (o.mode === 'remove') {
      const copy = new Uint8Array(await files[0].blob.arrayBuffer());
      const after = await ctx.engine.run('readMetadata', { bytes: copy }, [copy.buffer]);
      const left = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'].filter((k) => after[k]);
      check = left.length || after.hasXmp
        ? { tone: 'warn', text: `Some data could not be removed: ${left.map((k) => LABELS[k]).join(', ')}.` }
        : { tone: 'info', text: 'Checked: no title, author, app name, dates or XMP data remain in the file.' };
    }
    return {
      title: o.mode === 'remove' ? 'Metadata removed' : 'Metadata updated',
      summary: `${files.length === 1 ? 'Your PDF is' : `${files.length} PDFs are`} ready. The pages look exactly the same.`,
      notes: check ? [check] : [],
      files,
      zipName: 'clean-pdfs.zip',
    };
  },
};
