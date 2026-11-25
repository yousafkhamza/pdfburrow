import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as ops from '../../src/app/pdf-ops.js';
import { containsText, fakeJpeg, makePdf, pageCount, PDFLib, png, textOf } from '../helpers.js';

const lib = PDFLib;
const load = (b) => PDFLib.PDFDocument.load(b);

describe('loading', () => {
  it('rejects files that are not PDFs', async () => {
    await assert.rejects(ops.loadPdf(lib, new Uint8Array([1, 2, 3])), { code: 'invalid-pdf' });
  });
  it('recognises password-protected PDFs', async () => {
    const doc = await PDFLib.PDFDocument.create();
    doc.addPage();
    doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: 'Standard', V: 4 });
    const bytes = await doc.save({ useObjectStreams: false });
    await assert.rejects(ops.loadPdf(lib, bytes), { code: 'encrypted' });
  });
});

describe('merge and images', () => {
  it('merges PDFs and images in order', async () => {
    const a = await makePdf({ pages: 2, text: (i) => `A${i + 1}` });
    const b = await makePdf({ pages: 3, text: (i) => `B${i + 1}` });
    const out = await ops.merge(lib, [
      { kind: 'pdf', bytes: a },
      { kind: 'image', bytes: png(40, 20), format: 'png', width: 40, height: 20 },
      { kind: 'pdf', bytes: b },
    ]);
    assert.equal(await pageCount(out), 6);
    const text = await textOf(out);
    assert.match(text[0], /A1/);
    assert.match(text[3], /B1/);
    assert.equal(text[2].trim(), ''); // the image page
  });
  it('lays images out on A4 in the right orientation', async () => {
    const out = await ops.imagesToPdf(lib, [
      { bytes: png(400, 200), format: 'png', width: 400, height: 200 },
      { bytes: png(200, 400), format: 'png', width: 200, height: 400 },
    ]);
    const doc = await load(out);
    const [p1, p2] = doc.getPages().map((p) => p.getSize());
    assert.ok(p1.width > p1.height, 'wide image -> landscape page');
    assert.ok(p2.height > p2.width, 'tall image -> portrait page');
  });
  it('refuses an empty list', async () => {
    await assert.rejects(ops.merge(lib, []), { code: 'no-files' });
  });
});

describe('split and organize', () => {
  it('splits by groups', async () => {
    const src = await makePdf({ pages: 5 });
    const outs = await ops.split(lib, src, [[1, 2], [3], [5, 4]]);
    assert.deepEqual(await Promise.all(outs.map(pageCount)), [2, 1, 2]);
    assert.match((await textOf(outs[2]))[0], /Page 5/);
  });
  it('rejects pages outside the file', async () => {
    await assert.rejects(ops.split(lib, await makePdf({ pages: 2 }), [[3]]), { code: 'bad-range' });
  });
  it('reorders, rotates, duplicates and adds blank pages', async () => {
    const src = await makePdf({ pages: 3 });
    const out = await ops.organize(lib, src, [{ source: 2, rotate: 90 }, { source: 0 }, { blank: true }, { source: 0, rotate: 270 }]);
    const doc = await load(out);
    assert.equal(doc.getPageCount(), 4);
    assert.equal(doc.getPage(0).getRotation().angle, 90);
    assert.equal(doc.getPage(3).getRotation().angle, 270);
    const text = await textOf(out);
    assert.match(text[0], /Page 3/);
    assert.match(text[1], /Page 1/);
    assert.equal(text[2].trim(), '');
  });
  it('adds rotation to pages that are already rotated', async () => {
    const out = await ops.organize(lib, await makePdf({ pages: 1, rotation: 90 }), [{ source: 0, rotate: 270 }]);
    assert.equal((await load(out)).getPage(0).getRotation().angle, 0);
  });
});

describe('page numbers, stamps and watermarks', () => {
  it('numbers pages, skipping the cover', async () => {
    const out = await ops.pageNumbers(lib, await makePdf({ pages: 4 }), { format: 'page-n-of-total', skipFirst: true, start: 1 });
    const text = await textOf(out);
    assert.doesNotMatch(text[0], /Page 1 of/);
    assert.match(text[1], /Page 1 of 3/);
    assert.match(text[3], /Page 3 of 3/);
  });
  it('places numbers inside rotated pages', async () => {
    const out = await ops.pageNumbers(lib, await makePdf({ pages: 1, rotation: 90, text: () => 'Rotated' }), { position: 'bottom-right', format: 'page-n-of-total' });
    assert.match((await textOf(out))[0], /Page 1 of 1/);
  });
  it('stamps an image and text', async () => {
    const out = await ops.stamp(lib, await makePdf({ pages: 2 }), {
      images: [{ bytes: png(60, 20), format: 'png' }],
      placements: [{ page: 1, image: 0, x: 300, y: 100, width: 150, height: 50 }],
      texts: [{ page: 1, text: '25 Nov 2026', x: 300, y: 90, size: 9 }],
    });
    const doc = await load(out);
    const xobjects = doc.getPage(1).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
    assert.ok(xobjects && xobjects.keys().length >= 1);
    assert.match((await textOf(out))[1], /25 Nov 2026/);
  });
  it('rejects a placement on a missing page', async () => {
    await assert.rejects(
      ops.stamp(lib, await makePdf({ pages: 1 }), { images: [{ bytes: png(4, 4), format: 'png' }], placements: [{ page: 3, image: 0, x: 0, y: 0, width: 10, height: 10 }] }),
      { code: 'bad-range' },
    );
  });
  it('watermarks only the chosen pages', async () => {
    const out = await ops.watermark(lib, await makePdf({ pages: 3 }), { image: { bytes: png(100, 30), format: 'png', width: 300, height: 90 }, mode: 'tile', opacity: 0.2, pages: [2] });
    const doc = await load(out);
    const has = (i) => (doc.getPage(i).node.Resources().lookup(PDFLib.PDFName.of("XObject"))?.keys().length ?? 0) > 0;
    assert.deepEqual([has(0), has(1), has(2)], [false, true, false]);
  });
});

describe('metadata', () => {
  it('reads and removes metadata completely', async () => {
    const src = await makePdf({ pages: 1, author: 'Jane Secretname' });
    const before = await ops.readMetadata(lib, src);
    assert.equal(before.author, 'Jane Secretname');
    assert.equal(before.creator, 'Secret Word Processor');
    const out = await ops.writeMetadata(lib, src, { mode: 'remove' });
    const after = await ops.readMetadata(lib, out);
    for (const key of ['title', 'author', 'subject', 'keywords', 'creator', 'producer', 'created', 'modified']) assert.equal(after[key], '', key);
    assert.equal(after.hasXmp, false);
    assert.ok(containsText(src, 'Secretname'), 'control: the original file contains the name');
    assert.ok(!containsText(out, 'Secretname'), 'author name must not remain anywhere in the file');
    assert.ok(!containsText(out, 'Secret Word Processor'));
  });
  it('edits metadata', async () => {
    const out = await ops.writeMetadata(lib, await makePdf({ pages: 1 }), { mode: 'edit', values: { title: 'Lease', author: 'Me', keywords: 'rent, flat' } });
    const m = await ops.readMetadata(lib, out);
    assert.equal(m.title, 'Lease');
    assert.equal(m.author, 'Me');
    assert.match(m.keywords, /rent/);
  });
});

describe('forms', () => {
  async function formPdf() {
    const doc = await PDFLib.PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const form = doc.getForm();
    form.createTextField('applicant.fullName').addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
    form.createCheckBox('agree').addToPage(page, { x: 50, y: 650, width: 16, height: 16 });
    const dd = form.createDropdown('country');
    dd.addOptions(['UAE', 'India', 'UK']);
    dd.addToPage(page, { x: 50, y: 600, width: 200, height: 24 });
    return doc.save();
  }
  it('lists and fills fields', async () => {
    const src = await formPdf();
    const fields = await ops.readForm(lib, src);
    assert.deepEqual(fields.map((f) => [f.name, f.type]), [['applicant.fullName', 'text'], ['agree', 'checkbox'], ['country', 'dropdown']]);
    const out = await ops.fillForm(lib, src, { 'applicant.fullName': 'Aisha Khan', agree: true, country: 'UK' });
    const form = (await load(out)).getForm();
    assert.equal(form.getTextField('applicant.fullName').getText(), 'Aisha Khan');
    assert.equal(form.getCheckBox('agree').isChecked(), true);
    assert.deepEqual(form.getDropdown('country').getSelected(), ['UK']);
  });
  it('ignores a dropdown value that is not an option', async () => {
    const out = await ops.fillForm(lib, await formPdf(), { country: 'Narnia' });
    assert.deepEqual((await load(out)).getForm().getDropdown('country').getSelected(), []);
  });
  it('flattens', async () => {
    const out = await ops.fillForm(lib, await formPdf(), { 'applicant.fullName': 'Final' }, { flatten: true });
    assert.equal((await load(out)).getForm().getFields().length, 0);
    assert.match((await textOf(out))[0], /Final/);
  });
  it('returns no fields for a plain PDF', async () => {
    assert.deepEqual(await ops.readForm(lib, await makePdf({ pages: 1 })), []);
  });
});

describe('crop, resize and ID scans', () => {
  it('crops margins', async () => {
    const out = await ops.crop(lib, await makePdf({ pages: 2, size: [600, 800] }), { margins: { top: 50, right: 20, bottom: 30, left: 10 }, pages: [2] });
    const doc = await load(out);
    assert.deepEqual(doc.getPage(0).getCropBox(), { x: 0, y: 0, width: 600, height: 800 });
    assert.deepEqual(doc.getPage(1).getCropBox(), { x: 10, y: 30, width: 570, height: 720 });
  });
  it('crops the side people see on rotated pages', async () => {
    // /Rotate 90 turns the page clockwise: its left edge is shown at the top.
    const out = await ops.crop(lib, await makePdf({ pages: 1, size: [600, 800], rotation: 90 }), { margins: { top: 50, right: 0, bottom: 0, left: 0 } });
    assert.deepEqual((await load(out)).getPage(0).getCropBox(), { x: 50, y: 0, width: 550, height: 800 });
  });
  it('refuses to crop away the whole page', async () => {
    await assert.rejects(ops.crop(lib, await makePdf({ pages: 1, size: [100, 100] }), { margins: { top: 60, bottom: 60, left: 0, right: 0 } }), { code: 'crop-too-much' });
  });
  it('resizes every page to A4', async () => {
    const out = await ops.resize(lib, await makePdf({ pages: 2, size: [612, 1008] }), { size: 'a4' });
    for (const p of (await load(out)).getPages()) {
      const s = p.getSize();
      assert.ok(Math.abs(s.width - 595.28) < 0.01 && Math.abs(s.height - 841.89) < 0.01);
    }
    assert.match((await textOf(out))[0], /Page 1/);
  });
  it('puts front and back on one page', async () => {
    const out = await ops.idScan(lib, [
      { bytes: png(856, 540), format: 'png', width: 856, height: 540 },
      { bytes: png(856, 540), format: 'png', width: 856, height: 540 },
    ], { pageSize: 'a4', card: 'id' });
    assert.equal(await pageCount(out), 1);
  });
});

describe('redaction and cleanup', () => {
  it('collects garbage so removed content is really gone', async () => {
    const doc = await PDFLib.PDFDocument.create();
    doc.addPage();
    doc.context.register(doc.context.flateStream('ORPHAN-SECRET-DATA'));
    assert.ok(containsText(await doc.save(), 'ORPHAN-SECRET-DATA'), 'control: without cleanup the orphan is saved');
    ops.collectGarbage(lib, doc);
    assert.ok(!containsText(await doc.save(), 'ORPHAN-SECRET-DATA'));
  });
  it('replaces pages so the original text no longer exists in the file', async () => {
    const src = await makePdf({ pages: 3, text: (i) => (i === 1 ? 'Account SECRET-123456 for Jane' : `Public page ${i + 1}`), author: 'Jane Secretname' });
    const out = await ops.replacePages(lib, src, [{ index: 1, bytes: fakeJpeg(100, 141), width: 595.28, height: 841.89 }]);
    assert.equal(await pageCount(out), 3);
    const text = await textOf(out);
    assert.equal(text[1].trim(), '');
    assert.match(text[0], /Public page 1/);
    assert.match((await textOf(src))[1], /SECRET-123456/, 'control: the original contains the secret');
    assert.ok(!containsText(out, 'SECRET-123456'), 'redacted text must not remain anywhere in the file');
    assert.ok(!containsText(out, 'Secretname'), 'metadata is stripped');
  });
  it('swaps in OCR pages scaled to the original size', async () => {
    const page = await makePdf({ pages: 1, size: [1700, 2200], text: () => 'OCR LAYER' });
    const out = await ops.replaceWithPdfPages(lib, await makePdf({ pages: 2 }), [{ index: 0, pdf: page, width: 595.28, height: 841.89 }]);
    const doc = await load(out);
    const s = doc.getPage(0).getSize();
    assert.ok(Math.abs(s.width - 595.28) < 0.5 && Math.abs(s.height - 841.89) < 0.5);
    assert.match((await textOf(out))[0], /OCR LAYER/);
  });
});

describe('compression', () => {
  async function photoPdf() {
    const doc = await PDFLib.PDFDocument.create();
    const img = await doc.embedJpg(fakeJpeg(2000, 1500, 300_000));
    doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 446 });
    return doc.save();
  }
  it('swaps photos for smaller versions and keeps text', async () => {
    const src = await photoPdf();
    const small = fakeJpeg(800, 600, 1000);
    const calls = [];
    const r = await ops.recompress(lib, src, { maxPx: 800, quality: 0.5 }, async (bytes, level) => {
      calls.push([bytes.length, level.maxPx]);
      return { bytes: small, width: 800, height: 600 };
    });
    assert.equal(r.images, 1);
    assert.equal(r.replaced, 1);
    assert.ok(r.bytes.length < src.length / 10, `${r.bytes.length} should be much smaller than ${src.length}`);
    assert.equal(calls[0][1], 800);
    const doc = await load(r.bytes);
    const xobj = doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
    const image = doc.context.lookup(xobj.get(xobj.keys()[0]));
    assert.equal(image.dict.lookup(PDFLib.PDFName.of('Width')).asNumber(), 800);
  });
  it('keeps the original image when the new one is not smaller', async () => {
    const r = await ops.recompress(lib, await photoPdf(), { maxPx: 9999, quality: 1 }, async () => ({ bytes: fakeJpeg(2000, 1500, 400_000), width: 2000, height: 1500 }));
    assert.equal(r.replaced, 0);
  });
  it('survives an encoder failure', async () => {
    const r = await ops.recompress(lib, await photoPdf(), { maxPx: 800, quality: 0.5 }, async () => {
      throw new Error('decode failed');
    });
    assert.equal(r.replaced, 0);
    assert.equal(await pageCount(r.bytes), 1);
  });
  it('builds a PDF from page images', async () => {
    const out = await ops.imagesAsPages(lib, [{ bytes: fakeJpeg(100, 141), width: 595, height: 842 }, { bytes: fakeJpeg(141, 100), width: 842, height: 595 }]);
    const sizes = (await load(out)).getPages().map((p) => p.getSize());
    assert.deepEqual(sizes, [{ width: 595, height: 842 }, { width: 842, height: 595 }]);
  });
});

describe('info', () => {
  it('reports display sizes of rotated pages', async () => {
    const r = await ops.info(lib, await makePdf({ pages: 1, size: [600, 800], rotation: 90 }));
    assert.deepEqual(r.pages[0], { width: 800, height: 600, rotation: 90 });
  });
});
