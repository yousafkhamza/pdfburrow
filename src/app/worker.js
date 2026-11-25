// PDF engine worker: heavy pdf-lib work runs here so the page never freezes.
// Messages: { id, op, args } -> { id, result } | { id, error: { code, message } }
import * as lib from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import * as ops from './pdf-ops.js';

/** Re-encode a JPEG smaller with OffscreenCanvas. Returns null when the browser can't decode it. */
async function encodeJpeg(bytes, { maxPx, quality }) {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

const handlers = {
  info: (a) => ops.info(lib, a.bytes),
  merge: (a) => ops.merge(lib, a.items, a.options),
  imagesToPdf: (a) => ops.imagesToPdf(lib, a.images, a.options),
  split: (a) => ops.split(lib, a.bytes, a.groups),
  organize: (a) => ops.organize(lib, a.bytes, a.plan),
  pageNumbers: (a) => ops.pageNumbers(lib, a.bytes, a.options),
  stamp: (a) => ops.stamp(lib, a.bytes, a.options),
  watermark: (a) => ops.watermark(lib, a.bytes, a.options),
  readMetadata: (a) => ops.readMetadata(lib, a.bytes),
  writeMetadata: (a) => ops.writeMetadata(lib, a.bytes, a.options),
  readForm: (a) => ops.readForm(lib, a.bytes),
  fillForm: (a) => ops.fillForm(lib, a.bytes, a.values, a.options),
  crop: (a) => ops.crop(lib, a.bytes, a.options),
  resize: (a) => ops.resize(lib, a.bytes, a.options),
  idScan: (a) => ops.idScan(lib, a.images, a.options),
  imagesAsPages: (a) => ops.imagesAsPages(lib, a.pages),
  replacePages: (a) => ops.replacePages(lib, a.bytes, a.replacements, a.options),
  replaceWithPdfPages: (a) => ops.replaceWithPdfPages(lib, a.bytes, a.replacements),
  recompress: (a) => ops.recompress(lib, a.bytes, a.level, encodeJpeg),
};

/** Buffers to transfer back instead of copying. */
function transferables(value, out = []) {
  if (value instanceof Uint8Array) out.push(value.buffer);
  else if (Array.isArray(value)) value.forEach((v) => transferables(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => transferables(v, out));
  return [...new Set(out)];
}

self.onmessage = async (event) => {
  const { id, op, args } = event.data ?? {};
  const handler = handlers[op];
  if (!handler) {
    self.postMessage({ id, error: { code: 'unknown-op', message: `Unknown operation ${op}` } });
    return;
  }
  try {
    const result = await handler(args ?? {});
    self.postMessage({ id, result }, transferables(result));
  } catch (error) {
    self.postMessage({
      id,
      error: { code: error?.code ?? 'failed', message: error?.message ?? 'Something went wrong while processing the PDF.' },
    });
  }
};
