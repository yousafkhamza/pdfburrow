import { attempts, choose, fits, targetLabel } from '../core/compress-plan.js';
import { formatBytes, formatChange } from '../core/format.js';
import { bytesOf, pdfOf } from '../files.js';
import { canvasToBytes, renderPage } from '../render.js';
import { outName, pdfBlob } from './common.js';

/** Turn every page into a JPEG at the level's dpi and quality. */
async function pagesAsImages(ctx, entry, level, report) {
  const doc = await pdfOf(entry);
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    report(p / doc.numPages);
    const { canvas, base } = await renderPage(doc, p, { scale: level.dpi / 72 });
    const bytes = await canvasToBytes(canvas, 'image/jpeg', level.quality);
    pages.push({ bytes, width: base.width, height: base.height });
    canvas.width = 0;
    canvas.height = 0;
    await ctx.nextFrame();
  }
  return ctx.engine.run('imagesAsPages', { pages }, pages.map((p) => p.bytes.buffer));
}

async function compressOne(ctx, entry, settings, step, steps) {
  const original = await bytesOf(entry);
  const list = attempts(settings);
  const results = [];
  let noPhotos = false;
  for (let k = 0; k < list.length; k += 1) {
    const level = list[k];
    if (level.method === 'keep-text' && noPhotos) continue;
    const base = step / steps;
    const span = 1 / steps;
    const report = (f) => ctx.progress(base + span * ((k + f) / list.length), `${steps > 1 ? `${entry.name}: ` : ''}${level.method === 'pages' ? 'Re-drawing pages' : 'Shrinking images'}…`);
    report(0);
    let bytes;
    if (level.method === 'keep-text') {
      const r = await ctx.engine.run('recompress', { bytes: original.slice(), level }, []);
      bytes = r.bytes;
      if (r.images === 0) noPhotos = true;
    } else {
      bytes = await pagesAsImages(ctx, entry, level, report);
    }
    // Keep only what can still win, to save memory.
    const best = results.reduce((a, b) => (a && a.size <= b.size ? a : b), null);
    results.push({ size: bytes.length, level, bytes: !best || bytes.length < best.size || fits(bytes.length, settings.targetBytes) ? bytes : null });
    if (settings.targetBytes && fits(bytes.length, settings.targetBytes)) break;
  }
  return { original, decision: choose(results, original.length, settings.targetBytes) };
}

export default {
  async run(ctx) {
    const { level, allowPages } = ctx.options;
    const targetBytes = /^\d+$/.test(level) ? Number(level) * 1024 : null;
    const settings = { targetBytes, preset: level, allowPages };
    const files = [];
    const notes = [];
    let before = 0;
    let after = 0;
    for (let i = 0; i < ctx.entries.length; i += 1) {
      const entry = ctx.entries[i];
      const { original, decision } = await compressOne(ctx, entry, settings, i, ctx.entries.length);
      before += original.length;
      if (!decision.pick) {
        after += original.length;
        notes.push({
          tone: 'info',
          text: targetBytes && original.length <= targetBytes
            ? `"${entry.name}" is already under ${targetLabel(Number(level))} (${formatBytes(original.length)}). No change needed.`
            : `"${entry.name}" is already as small as it can be without losing quality.`,
        });
        continue;
      }
      const pick = decision.pick;
      after += pick.size;
      files.push({ name: outName(entry, 'compressed'), blob: pdfBlob(pick.bytes) });
      if (pick.level.method === 'pages') {
        notes.push({ tone: 'warn', text: `${ctx.entries.length > 1 ? `"${entry.name}": ` : ''}pages were turned into images to reach this size, so the text can no longer be selected or searched.` });
      }
      if (decision.reason === 'target-not-reached') {
        notes.push({
          tone: 'warn',
          text: `${ctx.entries.length > 1 ? `"${entry.name}": ` : ''}couldn't get under ${targetLabel(Number(level))} and stay readable. This is the smallest readable version (${formatBytes(pick.size)}).`,
        });
      }
    }
    if (!files.length) return { title: 'Nothing to compress', summary: 'Your file is already small.', files: [], notes };
    return {
      title: ctx.entries.length > 1 ? 'Your compressed PDFs are ready' : 'Your compressed PDF is ready',
      summary: `${formatBytes(before)} → ${formatBytes(after)} (${formatChange(before, after)})`,
      sizes: { before, after },
      files,
      notes,
      zipName: 'compressed-pdfs.zip',
    };
  },
};
