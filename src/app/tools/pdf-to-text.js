import { baseName, pluralize } from '../core/format.js';
import { pdfOf } from '../files.js';
import { tesseract, tesseractOptions } from '../libs.js';
import { pageText, renderPage } from '../render.js';
import { copyBytes, outName, pdfFile } from './common.js';

const OCR_DPI = 220;
let worker = null;

async function ocrWorker(ctx, onProgress) {
  const Tesseract = await tesseract();
  ctx.progress(null, 'Loading the text reader (about 12 MB, only the first time)…');
  const w = await Tesseract.createWorker('eng', 1, {
    ...tesseractOptions(),
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress(m.progress);
    },
  });
  return w;
}

/** A page has "real" text when pdf.js finds a few words on it. */
const hasText = (text) => text.replace(/\s+/g, '').length > 8;

export default {
  async onCancel() {
    await worker?.terminate?.();
    worker = null;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const doc = await pdfOf(entry);
    const searchable = ctx.options.output === 'searchable';
    const useOcr = searchable || ctx.options.ocr;
    const n = doc.numPages;
    const texts = [];
    const scanned = [];
    let current = 1;
    const report = (f) => ctx.progress((current - 1 + f) / n, `Reading page ${current} of ${n}…`);

    try {
      for (current = 1; current <= n; current += 1) {
        report(0);
        const text = await pageText(doc, current);
        if (hasText(text)) {
          texts.push(text);
          continue;
        }
        if (!useOcr) {
          texts.push('');
          continue;
        }
        worker ??= await ocrWorker(ctx, report);
        const { canvas, base } = await renderPage(doc, current, { scale: OCR_DPI / 72 });
        const result = await worker.recognize(canvas, {}, { text: true, pdf: searchable });
        texts.push((result.data.text || '').trim());
        if (searchable) {
          const pdf = result.data.pdf;
          if (!pdf) throw new Error('This browser could not build the searchable page.');
          scanned.push({ index: current - 1, pdf: new Uint8Array(pdf), width: base.width, height: base.height });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await worker?.terminate?.();
      worker = null;
    }

    if (searchable) {
      if (!scanned.length) {
        return {
          title: 'Already searchable',
          summary: 'Every page already has text you can search and copy, so nothing needed to change.',
          files: [],
        };
      }
      ctx.progress(0.95, 'Adding the text layer…');
      const bytes = await copyBytes(entry);
      const out = await ctx.engine.run(
        'replaceWithPdfPages',
        { bytes, replacements: scanned },
        [bytes.buffer, ...scanned.map((s) => s.pdf.buffer)],
      );
      return {
        title: 'Your searchable PDF is ready',
        summary: `${pluralize(scanned.length, 'scanned page')} now ${scanned.length === 1 ? 'has' : 'have'} a hidden text layer you can search and copy.`,
        notes: [{ tone: 'info', text: 'OCR reads English. Check names and numbers before relying on them.' }],
        files: [pdfFile(outName(entry, 'searchable'), out)],
      };
    }

    const body = texts.map((t, i) => (n > 1 ? `--- Page ${i + 1} ---\n${t}` : t)).join('\n\n').trim();
    const empty = texts.filter((t) => !t).length;
    const notes = [];
    if (empty && !useOcr) notes.push({ tone: 'warn', text: `${pluralize(empty, 'page')} had no text. They may be scans: turn on OCR to read them.` });
    if (empty && useOcr) notes.push({ tone: 'warn', text: `No text was found on ${pluralize(empty, 'page')}.` });
    return {
      title: body ? 'Text extracted' : 'No text found',
      summary: body ? `${pluralize(n, 'page')} read. Copy the text below or download it as a .txt file.` : 'This PDF does not seem to contain any text.',
      notes,
      text: body,
      files: body ? [{ name: `${baseName(entry.name)}.txt`, blob: new Blob([body], { type: 'text/plain;charset=utf-8' }) }] : [],
    };
  },
};
