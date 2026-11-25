import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cropBox,
  displaySize,
  fitInside,
  idScanLayout,
  imagePage,
  mm,
  normalizeRotation,
  PAGE_SIZES,
  pageLabel,
  positionBox,
  toDisplaySpace,
  toUserSpace,
} from '../../src/app/core/layout.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);

describe('rotation', () => {
  it('normalises any angle to 0/90/180/270', () => {
    assert.equal(normalizeRotation(-90), 270);
    assert.equal(normalizeRotation(450), 90);
    assert.equal(normalizeRotation(undefined), 0);
  });
  it('swaps size for sideways pages', () => {
    assert.deepEqual(displaySize(600, 800, 90), { width: 800, height: 600 });
    assert.deepEqual(displaySize(600, 800, 180), { width: 600, height: 800 });
  });
  it('maps display points to user space and back for every rotation', () => {
    for (const r of [0, 90, 180, 270]) {
      for (const [dx, dy] of [[0, 0], [10, 20], [123.5, 456.25]]) {
        const u = toUserSpace(600, 800, r, dx, dy);
        const d = toDisplaySpace(600, 800, r, u.x, u.y);
        near(d.x, dx, `r=${r} x`);
        near(d.y, dy, `r=${r} y`);
      }
    }
  });
  it('puts the display corners where viewers show them', () => {
    // /Rotate 90 is clockwise: the user-space top-left corner is shown top-right.
    assert.deepEqual(toDisplaySpace(600, 800, 90, 0, 800), { x: 800, y: 600 });
    // Display bottom-left of a 90° page is user-space bottom-right.
    assert.deepEqual(toUserSpace(600, 800, 90, 0, 0), { x: 600, y: 0 });
  });
});

describe('placement', () => {
  it('positions boxes by name', () => {
    assert.deepEqual(positionBox(600, 800, 100, 20, 'bottom-center', 30), { x: 250, y: 30 });
    assert.deepEqual(positionBox(600, 800, 100, 20, 'top-right', 30), { x: 470, y: 750 });
    assert.deepEqual(positionBox(600, 800, 100, 20, 'center', 30), { x: 250, y: 390 });
    assert.deepEqual(positionBox(600, 800, 100, 20, 'middle-left', 10), { x: 10, y: 390 });
  });
  it('fits keeping the aspect ratio', () => {
    assert.deepEqual(fitInside(200, 100, 100, 100), { width: 100, height: 50, scale: 0.5 });
    assert.deepEqual(fitInside(10, 10, 100, 100, false), { width: 10, height: 10, scale: 1 });
    assert.deepEqual(fitInside(0, 10, 100, 100), { width: 0, height: 0, scale: 0 });
  });
  it('lays out image pages', () => {
    const p = imagePage(4000, 3000, { size: 'a4' });
    near(p.pageWidth, PAGE_SIZES.a4.height, 'landscape width');
    assert.ok(p.width <= p.pageWidth && p.height <= p.pageHeight);
    const fit = imagePage(800, 600, { size: 'fit', margin: 10 });
    assert.deepEqual([fit.pageWidth, fit.pageHeight, fit.x], [620, 470, 10]);
    const portrait = imagePage(4000, 3000, { size: 'a4', orientation: 'portrait' });
    assert.ok(portrait.pageHeight > portrait.pageWidth);
  });
  it('places an ID card at real size, front on top', () => {
    const { boxes, width, height } = idScanLayout('a4', 'id', [{ width: 856, height: 540 }, { width: 856, height: 540 }]);
    near(boxes[0].width, mm(85.6));
    near(boxes[0].height, mm(53.98));
    assert.ok(boxes[0].y > boxes[1].y, 'front above back');
    for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height);
  });
  it('turns the card to match a portrait photo', () => {
    const { boxes } = idScanLayout('a4', 'id', [{ width: 540, height: 856 }]);
    assert.ok(boxes[0].height > boxes[0].width);
  });
});

describe('labels and crop boxes', () => {
  it('formats page labels', () => {
    assert.equal(pageLabel('n', 3, 10), '3');
    assert.equal(pageLabel('page-n', 3, 10), 'Page 3');
    assert.equal(pageLabel('page-n-of-total', 3, 10), 'Page 3 of 10');
    assert.equal(pageLabel('n-of-total', 3, 10), '3 / 10');
  });
  it('crops the sides people see, for every rotation', () => {
    const box = { x: 0, y: 0, width: 600, height: 800 };
    const m = { top: 10, right: 20, bottom: 30, left: 40 };
    assert.deepEqual(cropBox(box, 0, m), { x: 40, y: 30, width: 540, height: 760 });
    // 180°: display top is user bottom, display left is user right.
    assert.deepEqual(cropBox(box, 180, m), { x: 20, y: 10, width: 540, height: 760 });
    // 90°: display top = user left, right = user top, bottom = user right, left = user bottom.
    assert.deepEqual(cropBox(box, 90, m), { x: 10, y: 40, width: 560, height: 740 });
    // 270°: display top = user right, right = user bottom, bottom = user left, left = user top.
    assert.deepEqual(cropBox(box, 270, m), { x: 30, y: 20, width: 560, height: 740 });
    assert.equal(cropBox(box, 0, { top: 400, bottom: 400 }), null);
  });
});
