// Reading and drawing PDFs with pdf.js (main thread; pdf.js runs its own parser worker).
import { pdfjs, pdfjsOptions } from './libs.js';

const MAX_CANVAS_PIXELS = 16_000_000; // Safari's limit is about 16.7 million

export function appError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Open a PDF. Throws code 'encrypted' for password-protected files. */
export async function openPdf(bytes, password) {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer it is given, so always pass a copy.
  const task = lib.getDocument({ data: bytes.slice(), password, ...pdfjsOptions() });
  try {
    return await task.promise;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw appError(error.code === 2 ? 'wrong-password' : 'encrypted', 'This PDF is password-protected.');
    }
    throw appError('invalid-pdf', 'This file could not be read as a PDF. It may be damaged.');
  }
}

/**
 * Render a page to a canvas.
 * Give either `scale` (1 = 72 dpi) or `width` in CSS pixels. Returns the canvas and the viewport.
 */
export async function renderPage(doc, pageNumber, { scale, width, maxPixels = MAX_CANVAS_PIXELS } = {}) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let s = width ? width / base.width : scale ?? 1;
  if (base.width * s * base.height * s > maxPixels) s = Math.sqrt(maxPixels / (base.width * base.height));
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { canvas, viewport, scale: s, base };
}

export function canvasToBytes(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(appError('canvas', 'The page was too large to draw on this device.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality,
    );
  });
}

/** Text of one page, with line breaks where pdf.js detects the end of a line. */
export async function pageText(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    text += item.str;
    text += item.hasEOL ? '\n' : item.str && !item.str.endsWith(' ') ? ' ' : '';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text items with their boxes in viewport-at-scale-1 coordinates (top-left origin), for search. */
export async function textBoxes(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const lib = await pdfjs();
  const items = [];
  for (const item of content.items) {
    if (!item.str) continue;
    const tx = lib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const width = item.width * viewport.scale;
    items.push({ str: item.str, x: tx[4], y: tx[5] - fontHeight, width, height: fontHeight * 1.2 });
  }
  return { items, width: viewport.width, height: viewport.height };
}
