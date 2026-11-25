// File handling in the browser: detect type, read bytes, turn any image into something a PDF
// can embed (JPEG or PNG), with phone-photo orientation applied.
import { jpegInfo, pngInfo } from './core/image-info.js';
import { detectKind, isImage } from './core/sniff.js';
import { heic2any } from './libs.js';
import { appError, openPdf } from './render.js';

let nextId = 1;

export async function describe(file) {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const kind = detectKind(head, file.name);
  return {
    id: nextId++,
    file,
    name: file.name || (kind === 'pdf' ? 'document.pdf' : 'image'),
    size: file.size,
    kind,
    isImage: isImage(kind),
    bytes: null,
    pdf: null,
    pageCount: null,
    locked: false,
  };
}

export async function bytesOf(entry) {
  if (!entry.bytes) entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
  return entry.bytes;
}

/** pdf.js document for a PDF entry, opened once and cached. */
export async function pdfOf(entry, password) {
  if (entry.pdf && !password) return entry.pdf;
  const doc = await openPdf(await bytesOf(entry), password);
  if (!password) entry.pdf = doc;
  entry.pageCount = doc.numPages;
  return doc;
}

/** Page count and lock state, filled in after a PDF is added. Never throws. */
export async function inspect(entry) {
  if (entry.kind !== 'pdf') return entry;
  try {
    await pdfOf(entry);
  } catch (error) {
    if (error.code === 'encrypted') entry.locked = true;
    else entry.broken = true;
  }
  return entry;
}

function decodeToCanvas(blob) {
  return createImageBitmap(blob, { imageOrientation: 'from-image' }).then((bitmap) => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas;
  });
}

function canvasBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(appError('invalid-image', 'An image could not be converted.'))),
      type,
      quality,
    );
  });
}

/**
 * Image ready for pdf-lib: { bytes, format: 'jpg'|'png', width, height }.
 * JPEG and PNG pass through untouched (no quality loss) unless a phone photo needs rotating.
 */
export async function imageForPdf(entry) {
  const bytes = await bytesOf(entry);
  try {
    if (entry.kind === 'jpg') {
      const info = jpegInfo(bytes);
      if (info && info.orientation === 1) return { bytes, format: 'jpg', width: info.width, height: info.height };
      const canvas = await decodeToCanvas(new Blob([bytes], { type: 'image/jpeg' }));
      return { bytes: await canvasBytes(canvas, 'image/jpeg', 0.92), format: 'jpg', width: canvas.width, height: canvas.height };
    }
    if (entry.kind === 'png') {
      const info = pngInfo(bytes);
      if (info) return { bytes, format: 'png', width: info.width, height: info.height };
    }
    let blob = new Blob([bytes], { type: entry.file.type || 'application/octet-stream' });
    if (entry.kind === 'heic') {
      const convert = await heic2any();
      const out = await convert({ blob, toType: 'image/jpeg', quality: 0.92 });
      blob = Array.isArray(out) ? out[0] : out;
      const jpg = new Uint8Array(await blob.arrayBuffer());
      const info = jpegInfo(jpg);
      if (info) return { bytes: jpg, format: 'jpg', width: info.width, height: info.height };
    }
    const canvas = await decodeToCanvas(blob);
    // WebP, GIF, BMP: PNG keeps transparency and sharp edges.
    return { bytes: await canvasBytes(canvas, 'image/png'), format: 'png', width: canvas.width, height: canvas.height };
  } catch (error) {
    if (error?.code) throw error;
    throw appError(
      'invalid-image',
      entry.kind === 'heic'
        ? `"${entry.name}" could not be converted. On iPhone, set Camera > Formats to "Most Compatible", or share the photo as JPEG.`
        : `"${entry.name}" could not be read as an image.`,
    );
  }
}

/** A small preview URL for an image entry. Caller revokes it. */
export function previewUrl(entry) {
  return URL.createObjectURL(entry.file);
}
