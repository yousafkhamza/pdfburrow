// Test helpers: build PDFs and images in Node, read PDFs back.
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';

// pdf-lib's npm package is CommonJS; require() gives the complete export object.
export const PDFLib = createRequire(import.meta.url)('pdf-lib');

// ---------- PNG encoder (enough for tests) ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A solid-colour (or noisy) RGB PNG. */
export function png(width, height, { rgb = [200, 40, 40], noise = false } = {}) {
  const rows = [];
  let seed = 7;
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        row[1 + x * 3 + c] = noise ? seed & 0xff : rgb[c];
      }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]),
  );
}

/**
 * A JPEG header that pdf-lib accepts (it only reads the markers), padded to a size.
 * Not decodable as a picture; good for testing how images are swapped inside PDFs.
 */
export function fakeJpeg(width, height, padding = 0, orientation = null) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    // APP1 Exif, little-endian TIFF with one IFD entry: Orientation.
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(body.length + 2);
    parts.push(Buffer.from([0xff, 0xe1]), len, body);
  }
  if (padding > 0) {
    // COM segments (max 65533 bytes each) to make the file large.
    let left = padding;
    while (left > 0) {
      const n = Math.min(65000, left);
      const len = Buffer.alloc(2);
      len.writeUInt16BE(n + 2);
      parts.push(Buffer.from([0xff, 0xfe]), len, Buffer.alloc(n, 0x41));
      left -= n;
    }
  }
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return new Uint8Array(Buffer.concat(parts));
}

/** A PDF with text on every page. */
export async function makePdf({ pages = 3, text = (i) => `Page ${i + 1} sample text`, size = [595.28, 841.89], rotation = 0, author = null, objectStreams = false } = {}) {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage(size);
    page.drawText(text(i), { x: 72, y: size[1] - 100, size: 18, font });
    if (rotation) page.setRotation(PDFLib.degrees(rotation));
  }
  if (author) {
    doc.setAuthor(author);
    doc.setCreator('Secret Word Processor');
    doc.setTitle('Quarterly plan');
  }
  return doc.save({ useObjectStreams: objectStreams });
}

export async function pageCount(bytes) {
  return (await PDFLib.PDFDocument.load(bytes)).getPageCount();
}

/** Text of every page, using pdf.js (the same engine browsers use). */
export async function textOf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => i.str).join(' '));
  }
  await doc.destroy();
  return pages;
}

/**
 * Does the file contain this text in any form? Checks plain text and the hex encodings PDFs use
 * (pdf-lib writes page text and metadata as hex strings), so "not found" really means gone.
 */
export function containsText(bytes, text) {
  const raw = rawContent(bytes);
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  const hex8 = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  const hex16 = Buffer.from(text, 'utf16le').swap16().toString('hex').toUpperCase();
  return raw.includes(text) || upper.includes(hex8) || upper.includes(hex16);
}

/** Everything inside the file, with compressed streams inflated: for "is it really gone?" checks. */
export function rawContent(bytes) {
  const buf = Buffer.from(bytes);
  const text = buf.toString('latin1');
  const parts = [text];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    try {
      parts.push(inflateSync(buf.subarray(start, end)).toString('latin1'));
    } catch {
      /* not deflated, or trailing whitespace: try without the last byte */
      try {
        parts.push(inflateSync(buf.subarray(start, end - 1)).toString('latin1'));
      } catch {
        /* not a deflate stream */
      }
    }
    re.lastIndex = end;
  }
  return parts.join('\n');
}
