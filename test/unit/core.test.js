import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { attempts, choose, KEEP_TEXT_LEVELS, PAGE_LEVELS, targetLabel, targetSlug } from '../../src/app/core/compress-plan.js';
import { baseName, formatBytes, formatChange, safeFileName, suffixName } from '../../src/app/core/format.js';
import { jpegInfo, orientedSize, pngInfo } from '../../src/app/core/image-info.js';
import { chunkPages, describePages, parseRanges } from '../../src/app/core/ranges.js';
import { acceptAttribute, detectKind } from '../../src/app/core/sniff.js';
import { fakeJpeg, png } from '../helpers.js';

const bytes = (s) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('formatBytes', () => {
  it('formats sizes the way upload forms show them', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(200 * 1024), '200 KB');
    assert.equal(formatBytes(2.4 * 1024 * 1024), '2.4 MB');
    assert.equal(formatBytes(-5), '0 B');
    assert.equal(formatBytes(NaN), '0 B');
  });
  it('shows a percentage change', () => {
    assert.equal(formatChange(1000, 80), '−92%');
    assert.equal(formatChange(100, 150), '+50%');
    assert.equal(formatChange(0, 10), '0%');
  });
});

describe('file names', () => {
  it('keeps names readable and safe', () => {
    assert.equal(baseName('C:\\docs\\Report (final).PDF'), 'Report (final)');
    assert.equal(baseName('.hidden'), '.hidden');
    assert.equal(safeFileName('a/b:c*?.pdf', 'pdf'), 'b c .pdf'.replace(' .pdf', '.pdf'));
    assert.equal(safeFileName('عقد العمل.pdf', 'pdf'), 'عقد العمل.pdf');
    assert.equal(safeFileName('', 'pdf'), 'document.pdf');
    assert.equal(safeFileName('...', 'pdf'), 'document.pdf');
    assert.equal(suffixName('invoice.pdf', 'compressed'), 'invoice-compressed.pdf');
    assert.ok(safeFileName('x'.repeat(500), 'pdf').length <= 124);
  });
});

describe('page ranges', () => {
  it('parses what people type', () => {
    assert.deepEqual(parseRanges('1-3, 5, 8-end', 10).groups, [[1, 2, 3], [5], [8, 9, 10]]);
    assert.deepEqual(parseRanges('  2 – 4 ;6', 10).groups, [[2, 3, 4], [6]]);
    assert.deepEqual(parseRanges('-3', 5).pages, [1, 2, 3]);
    assert.deepEqual(parseRanges('4-', 5).pages, [4, 5]);
    assert.deepEqual(parseRanges('last', 5).pages, [5]);
    assert.deepEqual(parseRanges('5-3', 5).pages, [5, 4, 3]);
    assert.deepEqual(parseRanges('all', 3).pages, [1, 2, 3]);
    assert.deepEqual(parseRanges('', 2).pages, [1, 2]);
    assert.deepEqual(parseRanges('odd', 5).pages, [1, 3, 5]);
    assert.deepEqual(parseRanges('even', 5).pages, [2, 4]);
  });
  it('explains mistakes', () => {
    assert.match(parseRanges('12', 10).error, /Page 12 doesn't exist\. This PDF has 10 pages/);
    assert.match(parseRanges('0', 10).error, /Page 0/);
    assert.match(parseRanges('abc', 10).error, /not a page or range/);
    assert.match(parseRanges('even', 1).error, /no even pages/);
    assert.match(parseRanges(', ,', 3).error, /at least one/);
    assert.match(parseRanges('1', 0).error, /no pages/);
  });
  it('chunks and describes pages', () => {
    assert.deepEqual(chunkPages(7, 3), [[1, 2, 3], [4, 5, 6], [7]]);
    assert.deepEqual(chunkPages(2, 0), [[1], [2]]);
    assert.equal(describePages([1, 2, 3, 5, 7, 8, 8]), '1-3, 5, 7-8');
  });
});

describe('file type detection', () => {
  it('reads magic bytes, not names', () => {
    assert.equal(detectKind(bytes('%PDF-1.7\n'), 'photo.jpg'), 'pdf');
    assert.equal(detectKind(bytes('junk\r\n%PDF-1.4'), 'x'), 'pdf');
    assert.equal(detectKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'doc.pdf'), 'jpg');
    assert.equal(detectKind(png(2, 2), ''), 'png');
    assert.equal(detectKind(bytes('RIFF\0\0\0\0WEBPVP8 '), ''), 'webp');
    assert.equal(detectKind(bytes('GIF89a'), ''), 'gif');
    assert.equal(detectKind(bytes('BM\0\0\0\0'), ''), 'bmp');
    assert.equal(detectKind(bytes('\0\0\0\x18ftypheic\0\0'), ''), 'heic');
    assert.equal(detectKind(bytes('\0\0\0\x18ftypavif\0\0'), ''), 'unknown');
    assert.equal(detectKind(bytes('hello world'), 'notes.txt'), 'unknown');
    assert.equal(detectKind(bytes(''), 'IMG_0001.HEIC'), 'heic');
  });
  it('builds accept attributes', () => {
    assert.match(acceptAttribute(['pdf']), /application\/pdf/);
    assert.match(acceptAttribute(['image']), /image\/\*/);
  });
});

describe('image headers', () => {
  it('reads JPEG size and EXIF orientation', () => {
    assert.deepEqual(jpegInfo(fakeJpeg(640, 480)), { width: 640, height: 480, orientation: 1 });
    assert.deepEqual(jpegInfo(fakeJpeg(640, 480, 0, 6)), { width: 640, height: 480, orientation: 6 });
    assert.deepEqual(jpegInfo(fakeJpeg(300, 200, 70000)), { width: 300, height: 200, orientation: 1 });
    assert.equal(jpegInfo(bytes('not a jpeg')), null);
  });
  it('reads PNG size', () => {
    assert.deepEqual(pngInfo(png(13, 7)), { width: 13, height: 7 });
    assert.equal(pngInfo(bytes('nope')), null);
  });
  it('swaps size for rotated orientations', () => {
    assert.deepEqual(orientedSize(4000, 3000, 6), { width: 3000, height: 4000 });
    assert.deepEqual(orientedSize(4000, 3000, 1), { width: 4000, height: 3000 });
  });
});

describe('compression plan', () => {
  it('tries quality first, pages only when allowed', () => {
    assert.equal(attempts({ preset: 'recommended' }).length, 1);
    assert.equal(attempts({ preset: 'smallest' })[0].method, 'pages');
    assert.deepEqual(attempts({ targetBytes: 1, allowPages: false }), KEEP_TEXT_LEVELS);
    assert.deepEqual(attempts({ targetBytes: 1 }), [...KEEP_TEXT_LEVELS, ...PAGE_LEVELS]);
  });
  it('picks the best quality that fits, else the smallest', () => {
    const r = [{ size: 900, level: 'a' }, { size: 450, level: 'b' }, { size: 300, level: 'c' }];
    assert.equal(choose(r, 1000, 500).pick.level, 'b');
    assert.equal(choose(r, 1000, 500).met, true);
    const miss = choose(r, 1000, 100);
    assert.equal(miss.pick.level, 'c');
    assert.equal(miss.reason, 'target-not-reached');
    assert.equal(choose([{ size: 1200 }], 1000, null).reason, 'already-small');
    // Without a target, a tiny saving isn't worth a new file…
    assert.equal(choose([{ size: 2000 }], 2500, null).reason, 'already-small');
    assert.equal(choose([{ size: 96_000 }], 100_000, null).reason, 'already-small');
    // …but a real one is.
    assert.equal(choose([{ size: 50_000 }], 100_000, null).reason, 'ok');
    assert.equal(choose([{ size: 1200 }], 1000, 2000).met, true);
    assert.equal(choose([], 1000, 500).reason, 'failed');
  });
  it('labels sizes', () => {
    assert.equal(targetLabel(200), '200 KB');
    assert.equal(targetLabel(1024), '1 MB');
    assert.equal(targetSlug(2048), '2mb');
  });
});
