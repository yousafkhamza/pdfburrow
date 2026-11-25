// PDF operations built on pdf-lib. `lib` is passed in: the browser worker passes the self-hosted
// build, unit tests pass the npm package. No DOM access here, so everything runs in a worker.
import {
  cropBox,
  displaySize,
  fitInside,
  idScanLayout,
  imagePage,
  normalizeRotation,
  PAGE_SIZES,
  pageLabel,
  positionBox,
  toUserSpace,
} from './core/layout.js';

export class OpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SAVE = { useObjectStreams: true, addDefaultPage: false };

export async function loadPdf(lib, bytes, { updateMetadata = false } = {}) {
  try {
    return await lib.PDFDocument.load(bytes, { updateMetadata });
  } catch (error) {
    if (error?.name === 'EncryptedPDFError' || /encrypt/i.test(String(error?.message))) {
      throw new OpError('encrypted', 'This PDF is password-protected. Unlock it first.');
    }
    throw new OpError('invalid-pdf', 'This file could not be read as a PDF. It may be damaged.');
  }
}

async function save(doc) {
  return doc.save(SAVE);
}

/**
 * Delete every object that can't be reached from the document root or Info dictionary.
 * pdf-lib writes every object it loaded, so without this a removed page's content, an old
 * revision's metadata or a replaced image would still be inside the saved file.
 */
export function collectGarbage(lib, doc) {
  const ctx = doc.context;
  const seen = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof lib.PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof lib.PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof lib.PDFArray) {
      for (let i = 0; i < o.size(); i += 1) stack.push(o.get(i));
    } else if (o instanceof lib.PDFStream) {
      stack.push(o.dict);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) {
      ctx.delete(ref);
      removed += 1;
    }
  }
  return removed;
}

function stripMetadataFrom(lib, doc) {
  const ref = doc.context.trailerInfo.Info;
  const info = ref ? doc.context.lookup(ref) : null;
  if (info instanceof lib.PDFDict) for (const key of info.keys()) info.delete(key);
  doc.catalog.delete(lib.PDFName.of('Metadata'));
}

/** Box, rotation and display size of a page. */
function pageGeometry(page) {
  const box = page.getCropBox();
  const rotation = normalizeRotation(page.getRotation().angle);
  return { box, rotation, display: displaySize(box.width, box.height, rotation) };
}

/** Convert a display-space point on a page to absolute user-space coordinates. */
function placeOnPage(page, dx, dy) {
  const { box, rotation } = pageGeometry(page);
  const u = toUserSpace(box.width, box.height, rotation, dx, dy);
  return { x: box.x + u.x, y: box.y + u.y, rotation };
}

async function embedImage(lib, doc, image) {
  try {
    return image.format === 'png' ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
  } catch {
    throw new OpError('invalid-image', 'One of the images could not be read.');
  }
}

/** Basic facts about a PDF. */
export async function info(lib, bytes) {
  const doc = await loadPdf(lib, bytes);
  return {
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((p) => {
      const g = pageGeometry(p);
      return { width: g.display.width, height: g.display.height, rotation: g.rotation };
    }),
  };
}

/**
 * Merge PDFs and images, in order.
 * items: [{ kind: 'pdf', bytes } | { kind: 'image', bytes, format: 'jpg'|'png', width, height }]
 */
export async function merge(lib, items, { imageSize = 'a4', margin = 0 } = {}) {
  if (!items?.length) throw new OpError('no-files', 'Add at least one file.');
  const out = await lib.PDFDocument.create();
  for (const item of items) {
    if (item.kind === 'pdf') {
      const src = await loadPdf(lib, item.bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
    } else {
      const img = await embedImage(lib, out, item);
      const layout = imagePage(item.width || img.width, item.height || img.height, { size: imageSize, margin });
      const page = out.addPage([layout.pageWidth, layout.pageHeight]);
      page.drawImage(img, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
    }
  }
  return save(out);
}

/** Images to one PDF: one image per page. */
export async function imagesToPdf(lib, images, { size = 'a4', orientation = 'auto', margin = 0 } = {}) {
  if (!images?.length) throw new OpError('no-files', 'Add at least one image.');
  const out = await lib.PDFDocument.create();
  for (const image of images) {
    const img = await embedImage(lib, out, image);
    const layout = imagePage(image.width || img.width, image.height || img.height, { size, orientation, margin });
    const page = out.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(img, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
  }
  return save(out);
}

/** Split into several PDFs. groups: [[1,2,3],[4,5]] (1-based page numbers). */
export async function split(lib, bytes, groups) {
  const src = await loadPdf(lib, bytes);
  const count = src.getPageCount();
  const outputs = [];
  for (const group of groups) {
    const indices = group.map((p) => p - 1);
    if (indices.some((i) => i < 0 || i >= count)) throw new OpError('bad-range', 'A page number is outside this PDF.');
    const out = await lib.PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    for (const page of pages) out.addPage(page);
    outputs.push(await save(out));
  }
  return outputs;
}

/**
 * Rebuild a PDF from a page plan.
 * plan: [{ source: 0-based page index, rotate: 0|90|180|270 } | { blank: true }]
 */
export async function organize(lib, bytes, plan) {
  if (!plan?.length) throw new OpError('empty', 'Keep at least one page.');
  const src = await loadPdf(lib, bytes);
  const out = await lib.PDFDocument.create();
  const sources = plan.filter((p) => !p.blank).map((p) => p.source);
  const copied = await out.copyPages(src, sources);
  let k = 0;
  let lastSize = [PAGE_SIZES.a4.width, PAGE_SIZES.a4.height];
  for (const step of plan) {
    if (step.blank) {
      out.addPage(lastSize);
      continue;
    }
    const page = copied[k];
    k += 1;
    const current = page.getRotation().angle;
    page.setRotation(lib.degrees(normalizeRotation(current + (step.rotate || 0))));
    out.addPage(page);
    const { width, height } = page.getSize();
    lastSize = [width, height];
  }
  return save(out);
}

/** Add page numbers. */
export async function pageNumbers(
  lib,
  bytes,
  { position = 'bottom-center', format = 'n', start = 1, skipFirst = false, fontSize = 11, margin = 28 } = {},
) {
  const doc = await loadPdf(lib, bytes);
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const pages = doc.getPages();
  const numbered = pages.length - (skipFirst ? 1 : 0);
  const first = Number.isFinite(start) ? Math.round(start) : 1;
  pages.forEach((page, i) => {
    if (skipFirst && i === 0) return;
    const n = first + i - (skipFirst ? 1 : 0);
    const text = pageLabel(format, n, first + numbered - 1);
    const { display } = pageGeometry(page);
    const width = font.widthOfTextAtSize(text, fontSize);
    const height = font.heightAtSize(fontSize, { descender: false });
    const at = positionBox(display.width, display.height, width, height, position, margin);
    const p = placeOnPage(page, at.x, at.y);
    page.drawText(text, {
      x: p.x,
      y: p.y,
      size: fontSize,
      font,
      color: lib.rgb(0.2, 0.2, 0.2),
      rotate: lib.degrees(p.rotation),
    });
  });
  return save(doc);
}

/**
 * Draw images (signatures, stamps) and short text on pages.
 * images: [{ bytes, format }]
 * placements: [{ page: 0-based, image: index, x, y, width, height }]  — display space, points, bottom-left
 * texts: [{ page, text, x, y, size }]                                   — display space
 */
export async function stamp(lib, bytes, { images = [], placements = [], texts = [] }) {
  const doc = await loadPdf(lib, bytes);
  const embedded = [];
  for (const image of images) embedded.push(await embedImage(lib, doc, image));
  const count = doc.getPageCount();
  for (const p of placements) {
    if (p.page < 0 || p.page >= count) throw new OpError('bad-range', 'A placement is on a page that does not exist.');
    const page = doc.getPage(p.page);
    const at = placeOnPage(page, p.x, p.y);
    page.drawImage(embedded[p.image], {
      x: at.x,
      y: at.y,
      width: p.width,
      height: p.height,
      opacity: p.opacity ?? 1,
      rotate: lib.degrees(at.rotation),
    });
  }
  if (texts.length) {
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    for (const t of texts) {
      const page = doc.getPage(t.page);
      const at = placeOnPage(page, t.x, t.y);
      page.drawText(t.text, { x: at.x, y: at.y, size: t.size ?? 10, font, color: lib.rgb(0.1, 0.1, 0.1), rotate: lib.degrees(at.rotation) });
    }
  }
  return save(doc);
}

/**
 * Watermark with an image (the text is drawn to an image by the browser, so any language works).
 * image: { bytes, format: 'png', width, height } — width/height in points at the chosen size
 * mode: 'center' | 'tile'; pages: 1-based list or null for all
 */
export async function watermark(lib, bytes, { image, mode = 'center', opacity = 0.3, pages = null }) {
  const doc = await loadPdf(lib, bytes);
  const img = await embedImage(lib, doc, image);
  const wanted = pages ? new Set(pages.map((p) => p - 1)) : null;
  doc.getPages().forEach((page, i) => {
    if (wanted && !wanted.has(i)) return;
    const { display } = pageGeometry(page);
    // Never wider than 90% of the page.
    const size = fitInside(image.width, image.height, display.width * 0.9, display.height * 0.9, false);
    const spots = [];
    if (mode === 'tile') {
      const stepX = size.width * 1.5;
      const stepY = size.height * 2.2;
      for (let y = -size.height / 2; y < display.height; y += stepY) {
        const shift = Math.round(y / stepY) % 2 ? stepX / 2 : 0;
        for (let x = -size.width / 2 + shift; x < display.width; x += stepX) spots.push({ x, y });
      }
    } else {
      spots.push({ x: (display.width - size.width) / 2, y: (display.height - size.height) / 2 });
    }
    for (const s of spots) {
      const at = placeOnPage(page, s.x, s.y);
      page.drawImage(img, { x: at.x, y: at.y, width: size.width, height: size.height, opacity, rotate: lib.degrees(at.rotation) });
    }
  });
  return save(doc);
}

const INFO_KEYS = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];

export async function readMetadata(lib, bytes) {
  const doc = await loadPdf(lib, bytes);
  const date = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : '');
  const info = doc.context.trailerInfo.Info ? doc.context.lookup(doc.context.trailerInfo.Info) : null;
  const extraKeys = info instanceof lib.PDFDict ? info.keys().map((k) => k.asString().replace(/^\//, '')) : [];
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    created: date(doc.getCreationDate()),
    modified: date(doc.getModificationDate()),
    hasXmp: doc.catalog.has(lib.PDFName.of('Metadata')),
    infoKeys: extraKeys,
    pageCount: doc.getPageCount(),
  };
}

/** mode 'remove' strips the Info dictionary and XMP; mode 'edit' sets the given values. */
export async function writeMetadata(lib, bytes, { mode = 'remove', values = {} } = {}) {
  const doc = await loadPdf(lib, bytes, { updateMetadata: false });
  if (mode === 'remove') {
    stripMetadataFrom(lib, doc);
    // Page-level XMP and piece info can also name the author or the editing app.
    for (const page of doc.getPages()) {
      page.node.delete(lib.PDFName.of('Metadata'));
      page.node.delete(lib.PDFName.of('PieceInfo'));
    }
    doc.catalog.delete(lib.PDFName.of('PieceInfo'));
    collectGarbage(lib, doc);
  } else {
    doc.setTitle(values.title ?? '');
    doc.setAuthor(values.author ?? '');
    doc.setSubject(values.subject ?? '');
    doc.setKeywords(
      String(values.keywords ?? '')
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
    );
    doc.setModificationDate(new Date());
  }
  return save(doc);
}

/** List form fields. */
export async function readForm(lib, bytes) {
  const doc = await loadPdf(lib, bytes);
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return [];
  }
  return fields.map((f) => {
    const name = f.getName();
    const readOnly = f.isReadOnly();
    if (f instanceof lib.PDFTextField) return { name, type: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), maxLength: f.getMaxLength() ?? null, readOnly };
    if (f instanceof lib.PDFCheckBox) return { name, type: 'checkbox', value: f.isChecked(), readOnly };
    if (f instanceof lib.PDFDropdown) return { name, type: 'dropdown', options: f.getOptions(), value: f.getSelected()[0] ?? '', readOnly };
    if (f instanceof lib.PDFOptionList) return { name, type: 'list', options: f.getOptions(), value: f.getSelected()[0] ?? '', readOnly };
    if (f instanceof lib.PDFRadioGroup) return { name, type: 'radio', options: f.getOptions(), value: f.getSelected() ?? '', readOnly };
    return { name, type: 'other', readOnly: true };
  });
}

/** Fill form fields. values: { [name]: string | boolean } */
export async function fillForm(lib, bytes, values, { flatten = false } = {}) {
  const doc = await loadPdf(lib, bytes);
  const form = doc.getForm();
  for (const f of form.getFields()) {
    const name = f.getName();
    if (!(name in values) || f.isReadOnly()) continue;
    const v = values[name];
    if (f instanceof lib.PDFTextField) {
      const max = f.getMaxLength();
      f.setText(max ? String(v ?? '').slice(0, max) : String(v ?? ''));
    } else if (f instanceof lib.PDFCheckBox) {
      if (v) f.check();
      else f.uncheck();
    } else if (f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) {
      if (v && f.getOptions().includes(v)) f.select(v);
      else if (!v) f.clear();
    } else if (f instanceof lib.PDFRadioGroup) {
      if (v && f.getOptions().includes(v)) f.select(v);
    }
  }
  if (flatten) form.flatten();
  return save(doc);
}

/** Crop pages by margins (points, as seen on screen). pages: 1-based list or null for all. */
export async function crop(lib, bytes, { margins, pages = null }) {
  const doc = await loadPdf(lib, bytes);
  const wanted = pages ? new Set(pages.map((p) => p - 1)) : null;
  doc.getPages().forEach((page, i) => {
    if (wanted && !wanted.has(i)) return;
    const { box, rotation } = pageGeometry(page);
    const next = cropBox(box, rotation, margins);
    if (!next) throw new OpError('crop-too-much', `The margins remove the whole of page ${i + 1}. Use smaller margins.`);
    page.setMediaBox(next.x, next.y, next.width, next.height);
    page.setCropBox(next.x, next.y, next.width, next.height);
    page.setTrimBox(next.x, next.y, next.width, next.height);
    page.setBleedBox(next.x, next.y, next.width, next.height);
    page.setArtBox(next.x, next.y, next.width, next.height);
  });
  return save(doc);
}

/** Put every page on a standard paper size, scaled to fit and centred. */
export async function resize(lib, bytes, { size = 'a4', margin = 0 } = {}) {
  const src = await loadPdf(lib, bytes);
  const out = await lib.PDFDocument.create();
  const paper = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
  for (const page of src.getPages()) {
    const embedded = await out.embedPage(page);
    const { box, rotation } = pageGeometry(page);
    // Orient the paper like the page's own (unrotated) content, then keep its rotation.
    const landscape = box.width > box.height;
    const w = landscape ? paper.height : paper.width;
    const h = landscape ? paper.width : paper.height;
    const fit = fitInside(box.width, box.height, w - margin * 2, h - margin * 2, true);
    const next = out.addPage([w, h]);
    next.drawPage(embedded, { x: (w - fit.width) / 2, y: (h - fit.height) / 2, width: fit.width, height: fit.height });
    next.setRotation(lib.degrees(rotation));
  }
  return save(out);
}

/** Front and back of an ID or passport on one page. images: [{ bytes, format, width, height }] */
export async function idScan(lib, images, { pageSize = 'a4', card = 'fill' } = {}) {
  if (!images?.length) throw new OpError('no-files', 'Add a photo of the front.');
  const out = await lib.PDFDocument.create();
  const layout = idScanLayout(pageSize, card, images.slice(0, 2));
  const page = out.addPage([layout.width, layout.height]);
  for (let i = 0; i < layout.boxes.length; i += 1) {
    const img = await embedImage(lib, out, images[i]);
    page.drawImage(img, layout.boxes[i]);
  }
  return save(out);
}

/** A PDF made of full-page JPEGs. pages: [{ bytes, width, height }] (points) */
export async function imagesAsPages(lib, pages) {
  const out = await lib.PDFDocument.create();
  for (const p of pages) {
    const img = await out.embedJpg(p.bytes);
    const page = out.addPage([p.width, p.height]);
    page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
  }
  return save(out);
}

/**
 * Replace some pages with full-page JPEGs. Used for redaction, so it is strict:
 * links, bookmarks, form fields and the tag structure are removed (they can point at the old
 * page and keep its content alive), then everything unreachable is deleted.
 * replacements: [{ index: 0-based, bytes, width, height }]
 */
export async function replacePages(lib, bytes, replacements, { stripMetadata = true } = {}) {
  const doc = await loadPdf(lib, bytes, { updateMetadata: false });
  const N = (name) => lib.PDFName.of(name);
  const sorted = [...replacements].sort((a, b) => a.index - b.index);
  for (const r of sorted) {
    if (r.index < 0 || r.index >= doc.getPageCount()) throw new OpError('bad-range', 'A page to replace does not exist.');
    const img = await doc.embedJpg(r.bytes);
    const page = doc.insertPage(r.index, [r.width, r.height]);
    page.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
    doc.removePage(r.index + 1);
  }
  for (const key of ['Outlines', 'Names', 'Dests', 'OpenAction', 'AcroForm', 'StructTreeRoot', 'MarkInfo', 'PageLabels']) {
    doc.catalog.delete(N(key));
  }
  for (const page of doc.getPages()) {
    page.node.delete(N('Annots'));
    page.node.delete(N('StructParents'));
  }
  if (stripMetadata) stripMetadataFrom(lib, doc);
  collectGarbage(lib, doc);
  return save(doc);
}

/**
 * Swap pages for pages from other PDFs (used to add an OCR text layer to scanned pages).
 * replacements: [{ index: 0-based, pdf: bytes of a 1-page PDF, width, height (display points) }]
 * Each new page is scaled to the old page's size so the document keeps its layout.
 */
export async function replaceWithPdfPages(lib, bytes, replacements) {
  const doc = await loadPdf(lib, bytes);
  for (const r of [...replacements].sort((a, b) => a.index - b.index)) {
    const src = await lib.PDFDocument.load(r.pdf);
    const [page] = await doc.copyPages(src, [0]);
    const { width, height } = page.getSize();
    page.scale(r.width / width, r.height / height);
    doc.insertPage(r.index, page);
    doc.removePage(r.index + 1);
  }
  collectGarbage(lib, doc);
  return save(doc);
}

/**
 * Re-save the JPEG photos inside a PDF smaller. Text and vector graphics are untouched.
 * encode(bytes, { maxPx, quality }) -> { bytes, width, height } | null, supplied by the caller
 * (OffscreenCanvas in the browser).
 */
export async function recompress(lib, bytes, level, encode) {
  const doc = await loadPdf(lib, bytes, { updateMetadata: false });
  const N = (name) => lib.PDFName.of(name);
  let total = 0;
  let replaced = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof lib.PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(N('Subtype')) !== N('Image')) continue;
    const filter = dict.get(N('Filter'));
    const isJpeg = filter === N('DCTDecode') || (filter instanceof lib.PDFArray && filter.size() === 1 && filter.get(0) === N('DCTDecode'));
    if (!isJpeg) continue;
    if (dict.has(N('Decode')) || String(dict.get(N('ImageMask'))) === 'true') continue;
    total += 1;
    const width = dict.lookup(N('Width'))?.asNumber?.() ?? 0;
    const height = dict.lookup(N('Height'))?.asNumber?.() ?? 0;
    if (width < 64 && height < 64) continue;
    const original = obj.getContents();
    let result = null;
    try {
      result = await encode(original, level);
    } catch {
      result = null;
    }
    if (!result || result.bytes.length >= original.length * 0.95) continue;
    const next = doc.context.stream(result.bytes, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: result.width,
      Height: result.height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    const smask = dict.get(N('SMask'));
    if (smask) next.dict.set(N('SMask'), smask);
    doc.context.assign(ref, next);
    replaced += 1;
  }
  // Drops leftovers from earlier edits of the file (old images, old revisions).
  collectGarbage(lib, doc);
  return { bytes: await save(doc), images: total, replaced };
}
