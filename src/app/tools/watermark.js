import { canvasToBytes } from '../render.js';
import { copyBytes, inputError, outName, pagesOption, pagesProblem, pdfFile } from './common.js';

const COLORS = { grey: '#6b7280', red: '#c81e1e', blue: '#1d4ed8' };
const SIZES = { small: 28, medium: 44, large: 64 }; // points

/**
 * Draw the watermark text as a transparent PNG. Drawing it in the browser means any language
 * and any character works (built-in PDF fonts only cover basic Latin).
 */
async function textImage(text, { color, angle, size }) {
  const scale = 3; // pixels per point, for a crisp print
  const fontPx = size * scale;
  const font = `700 ${fontPx}px "Inter", "Segoe UI", Arial, "Noto Sans", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const textWidth = probe.measureText(text).width;
  const textHeight = fontPx * 1.2;
  const rad = (angle * Math.PI) / 180;
  const w = Math.ceil(Math.abs(textWidth * Math.cos(rad)) + Math.abs(textHeight * Math.sin(rad))) + 8;
  const h = Math.ceil(Math.abs(textWidth * Math.sin(rad)) + Math.abs(textHeight * Math.cos(rad))) + 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-rad);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  const bytes = await canvasToBytes(canvas, 'image/png');
  return { bytes, format: 'png', width: w / scale, height: h / scale };
}

export default {
  ready(ctx) {
    if (!ctx.options.text.trim()) return 'Type the watermark text.';
    const count = ctx.entries[0]?.pageCount;
    return count ? pagesProblem(ctx.options.pages, count) : true;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const o = ctx.options;
    const text = o.text.trim();
    if (!text) throw inputError('Type the watermark text.');
    const pages = pagesOption(o.pages, entry.pageCount || 1);
    ctx.progress(0.2, 'Drawing the watermark…');
    if (document.fonts?.load) await document.fonts.load('700 40px "Inter"').catch(() => {});
    const image = await textImage(text, { color: COLORS[o.color] ?? COLORS.grey, angle: Number(o.angle) || 0, size: SIZES[o.size] ?? SIZES.large });
    ctx.progress(0.5, 'Adding it to the pages…');
    const bytes = await copyBytes(entry);
    const out = await ctx.engine.run(
      'watermark',
      { bytes, options: { image, mode: o.mode, opacity: Number(o.opacity) || 0.25, pages } },
      [bytes.buffer, image.bytes.buffer],
    );
    return {
      title: 'Watermark added',
      summary: `"${text}" added to ${pages ? `${pages.length} of ${entry.pageCount}` : 'all'} pages.`,
      files: [pdfFile(outName(entry, 'watermarked'), out)],
    };
  },
};
