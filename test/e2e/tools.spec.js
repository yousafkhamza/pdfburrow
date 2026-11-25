// End-to-end: each tool used like a person would, then the downloaded file is checked.
import { containsText, pageCount, PDFLib, textOf } from '../helpers.js';
import { addFiles, download, expect, openTool, runAndDownload, runOnly, test } from './fixtures.js';

const load = (bytes) => PDFLib.PDFDocument.load(bytes);
const MM = 72 / 25.4;

test.describe('merge', () => {
  test('merges PDFs and an image in the chosen order @smoke', async ({ page }) => {
    await openTool(page, 'merge-pdf');
    await addFiles(page, ['five.pdf', 'three.pdf', 'image.png']);
    await expect(page.locator('#files .file')).toHaveCount(3);
    await expect(page.locator('#run')).toHaveText('Merge 3 files');
    await page.getByRole('button', { name: 'Move three.pdf up' }).click();
    const out = await runAndDownload(page);
    expect(out.name).toBe('three-merged.pdf');
    expect(await pageCount(out.bytes)).toBe(9);
    const text = await textOf(out.bytes);
    expect(text[0]).toContain('Three page 1');
    expect(text[3]).toContain('Five page 1');
  });

  test('needs two files and says so', async ({ page }) => {
    await openTool(page, 'merge-pdf');
    await addFiles(page, ['three.pdf']);
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#run-hint')).toHaveText('Add 1 more file.');
  });

  test('explains when a file is not a PDF or image', async ({ page }) => {
    await openTool(page, 'merge-pdf');
    await page.setInputFiles('#file-input', ['notes.txt'].map((n) => `test/e2e/.fixtures/${n}`));
    await expect(page.locator('#error')).toContainText(`"notes.txt" isn't a PDF or image.`);
  });

  test('passes the result on to the next tool', async ({ page }) => {
    await openTool(page, 'merge-pdf');
    await addFiles(page, ['three.pdf', 'five.pdf']);
    await page.locator('#run').click();
    await expect(page.locator('#done')).toBeVisible();
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await expect(page).toHaveURL(/compress-pdf\/$/);
    await expect(page.locator('#files .file-name')).toHaveText('three-merged.pdf');
  });
});

test.describe('split', () => {
  test('suggests a split, accepts custom ranges, and zips the parts', async ({ page }) => {
    await openTool(page, 'split-pdf');
    await addFiles(page, ['five.pdf']);
    await expect(page.locator('#opt-ranges')).toHaveValue('1-3, 4-end');
    await page.fill('#opt-ranges', '2, 4-end');
    await page.locator('#run').click();
    await expect(page.locator('.out-list li')).toHaveCount(2);
    const first = await download(page, '.out-list li button');
    expect(await pageCount(first.bytes)).toBe(1);
    expect((await textOf(first.bytes))[0]).toContain('Five page 2');
    const zip = await download(page, '#download-zip');
    expect(Buffer.from(zip.bytes.subarray(0, 2)).toString()).toBe('PK');
  });

  test('explains a page that does not exist', async ({ page }) => {
    await openTool(page, 'split-pdf');
    await addFiles(page, ['three.pdf']);
    await page.fill('#opt-ranges', '1, 9');
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#run-hint')).toContainText("Page 9 doesn't exist");
  });
});

test.describe('compress', () => {
  test('shrinks a photo-heavy PDF and keeps its text @smoke', async ({ page }) => {
    await openTool(page, 'compress-pdf');
    await addFiles(page, ['photo.pdf']);
    const out = await runAndDownload(page);
    await expect(page.locator('.sizes .to')).toBeVisible();
    const original = (await import('node:fs')).statSync('test/e2e/.fixtures/photo.pdf').size;
    expect(out.bytes.length).toBeLessThan(original);
    expect((await textOf(out.bytes))[0]).toContain('Photo report page 1');
  });

  test('gets under 100 KB from a size page', async ({ page }) => {
    await openTool(page, 'compress-pdf/100kb');
    await expect(page.locator('#opt-level')).toHaveValue('100');
    await addFiles(page, ['photo.pdf']);
    const out = await runAndDownload(page);
    expect(out.bytes.length).toBeLessThanOrEqual(100 * 1024);
    expect(await pageCount(out.bytes)).toBe(2);
  });

  test('says when a file is already small', async ({ page }) => {
    await openTool(page, 'compress-pdf');
    await addFiles(page, ['three.pdf']);
    await runOnly(page);
    await expect(page.locator('#done')).toContainText(/already/i);
  });
});

test.describe('organize', () => {
  test('deletes and rotates pages', async ({ page }) => {
    await openTool(page, 'organize-pdf');
    await addFiles(page, ['five.pdf']);
    await expect(page.locator('.page-card')).toHaveCount(5);
    await page.getByRole('button', { name: 'Delete: Page 1 (position 1)' }).click();
    await page.getByRole('button', { name: 'Rotate right: Page 2 (position 1)' }).click();
    await page.getByRole('button', { name: 'Move later: Page 3 (position 2)' }).click();
    const out = await runAndDownload(page);
    const doc = await load(out.bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    const text = await textOf(out.bytes);
    expect(text[1]).toContain('Five page 4');
    expect(text[2]).toContain('Five page 3');
  });
});

test.describe('images and conversion', () => {
  test('turns images into a PDF @smoke', async ({ page }) => {
    await openTool(page, 'jpg-to-pdf');
    await addFiles(page, ['photo.jpg', 'image.png']);
    const out = await runAndDownload(page);
    const doc = await load(out.bytes);
    expect(doc.getPageCount()).toBe(2);
    const first = doc.getPage(0).getSize();
    expect(first.width).toBeGreaterThan(first.height); // landscape photo -> landscape A4
  });

  test('turns PDF pages into images', async ({ page }) => {
    await openTool(page, 'pdf-to-jpg');
    await addFiles(page, ['three.pdf']);
    await page.locator('#run').click();
    await expect(page.locator('.out-list li')).toHaveCount(3);
    const img = await download(page, '.out-list li button');
    expect(img.name).toBe('three-page-1.jpg');
    expect([img.bytes[0], img.bytes[1]]).toEqual([0xff, 0xd8]);
  });

  test('puts an ID front and back on one page', async ({ page }) => {
    await openTool(page, 'id-card-to-pdf');
    await addFiles(page, ['photo.jpg', 'image.png']);
    await expect(page.locator('.file-label')).toHaveText(['Front', 'Back']);
    const out = await runAndDownload(page);
    expect(await pageCount(out.bytes)).toBe(1);
  });
});

test.describe('editing', () => {
  test('numbers pages @smoke', async ({ page }) => {
    await openTool(page, 'add-page-numbers-to-pdf');
    await addFiles(page, ['three.pdf']);
    await page.selectOption('#opt-format', 'page-n-of-total');
    const out = await runAndDownload(page);
    expect((await textOf(out.bytes))[1]).toContain('Page 2 of 3');
  });

  test('watermarks every page', async ({ page }) => {
    await openTool(page, 'add-watermark-to-pdf');
    await addFiles(page, ['three.pdf']);
    await page.fill('#opt-text', 'COPY FOR BANK ONLY');
    const out = await runAndDownload(page);
    const doc = await load(out.bytes);
    for (const p of doc.getPages()) expect(p.node.Resources().lookup(PDFLib.PDFName.of('XObject'))?.keys().length ?? 0).toBeGreaterThan(0);
  });

  test('signs a page with a drawn signature', async ({ page }) => {
    await openTool(page, 'sign-pdf');
    await addFiles(page, ['three.pdf']);
    const pad = page.locator('canvas.pad');
    await expect(pad).toBeVisible();
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 30 + i * 20, box.y + box.height * (0.6 - Math.sin(i) * 0.2));
    await page.mouse.up();
    await expect(page.locator('#run-hint')).toHaveText('Click on the page where your signature goes.');
    await page.locator('.sig-layer').click({ position: { x: 200, y: 300 } });
    await expect(page.locator('.sig-box')).toHaveCount(1);
    await page.check('#sig-date');
    const out = await runAndDownload(page);
    const doc = await load(out.bytes);
    expect(doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'))?.keys().length ?? 0).toBeGreaterThan(0);
    expect((await textOf(out.bytes))[0]).toMatch(/\d{1,2} \w{3,4} \d{4}/);
  });

  test('types a signature', async ({ page }) => {
    await openTool(page, 'sign-pdf');
    await addFiles(page, ['three.pdf']);
    await page.getByRole('tab', { name: 'Type' }).click();
    await page.fill('#sig-name', 'Aisha Khan');
    // The typed signature renders once its handwriting font loads.
    await expect(page.locator('#run-hint')).toHaveText('Click on the page where your signature goes.');
    await page.getByRole('button', { name: 'Place in the centre' }).click();
    await expect(page.locator('.sig-box')).toHaveCount(1);
    const out = await runAndDownload(page);
    expect(await pageCount(out.bytes)).toBe(3);
  });

  test('fills a form', async ({ page }) => {
    await openTool(page, 'fill-pdf-form');
    await addFiles(page, ['form.pdf']);
    await page.getByLabel('Full Name').fill('Aisha Khan');
    await page.getByLabel('Agree').check();
    await page.getByLabel('Country').selectOption('UK');
    const out = await runAndDownload(page);
    const form = (await load(out.bytes)).getForm();
    expect(form.getTextField('applicant.fullName').getText()).toBe('Aisha Khan');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getDropdown('country').getSelected()).toEqual(['UK']);
  });

  test('says when a PDF has no form fields', async ({ page }) => {
    await openTool(page, 'fill-pdf-form');
    await addFiles(page, ['three.pdf']);
    await expect(page.locator('#custom')).toContainText('no fillable form fields');
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('crops margins', async ({ page }) => {
    await openTool(page, 'crop-pdf');
    await addFiles(page, ['three.pdf']);
    await expect(page.locator('.crop-preview')).toBeVisible();
    await page.fill('#opt-top', '20');
    const out = await runAndDownload(page);
    const crop = (await load(out.bytes)).getPage(0).getCropBox();
    expect(crop.height).toBeCloseTo(841.89 - 30 * MM, 1);
    expect(crop.width).toBeCloseTo(595.28 - 20 * MM, 1);
  });
});

test.describe('privacy and security', () => {
  test('protects with a password, then unlocks with it @smoke', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'qpdf (WebAssembly) times out in Playwright WebKit; works in Chrome and Firefox');
    await openTool(page, 'protect-pdf');
    await addFiles(page, ['three.pdf']);
    await page.fill('#opt-password', 'correct horse 42');
    await expect(page.locator('#run-hint')).toHaveText('Type the same password twice.');
    await page.fill('#opt-confirm', 'correct horse 42');
    const locked = await runAndDownload(page);
    await expect(load(locked.bytes)).rejects.toThrow(/encrypt/i);

    await openTool(page, 'unlock-pdf');
    await addFiles(page, [{ name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(locked.bytes) }]);
    await page.fill('#opt-password', 'wrong one');
    await runOnly(page);
    await expect(page.locator('#error')).toContainText('That password is not right');
    await page.fill('#opt-password', 'correct horse 42');
    const unlocked = await runAndDownload(page);
    expect(await pageCount(unlocked.bytes)).toBe(3);
    expect((await textOf(unlocked.bytes))[2]).toContain('Three page 3');
  });

  test('stops other tools from running on a locked PDF', async ({ page }) => {
    await openTool(page, 'protect-pdf');
    await addFiles(page, ['three.pdf']);
    await page.fill('#opt-password', 'secret-pw');
    await page.fill('#opt-confirm', 'secret-pw');
    const locked = await runAndDownload(page);
    await openTool(page, 'compress-pdf');
    await addFiles(page, [{ name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(locked.bytes) }]);
    await expect(page.locator('.flag.warn')).toHaveText('Password-protected');
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#run-hint')).toContainText('Unlock it first');
  });

  test('redacts found text so it is gone from the file', async ({ page }) => {
    await openTool(page, 'redact-pdf');
    await addFiles(page, ['secret.pdf']);
    await page.fill('#redact-term', 'SECRET-123456');
    await page.getByRole('button', { name: 'Find and mark' }).click();
    await expect(page.locator('#custom')).toContainText('Marked 1 match');
    const out = await runAndDownload(page);
    await expect(page.locator('#done')).toContainText('Checked: the marked content is gone');
    const text = await textOf(out.bytes);
    expect(text[1]).not.toContain('SECRET');
    expect(text[0]).toContain('Public page 1');
    expect(containsText(out.bytes, 'SECRET-123456')).toBe(false);
  });

  test('removes metadata and shows what was there', async ({ page }) => {
    await openTool(page, 'remove-pdf-metadata');
    await addFiles(page, ['meta.pdf']);
    await expect(page.locator('.meta-table')).toContainText('Jane Secretname');
    const out = await runAndDownload(page);
    await expect(page.locator('#done')).toContainText('Checked: no title, author');
    const doc = await PDFLib.PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(doc.getAuthor()).toBeUndefined();
    expect(containsText(out.bytes, 'Secretname')).toBe(false);
  });
});

test.describe('text and OCR', () => {
  test('extracts text from a normal PDF', async ({ page }) => {
    await openTool(page, 'pdf-to-text');
    await addFiles(page, ['three.pdf']);
    await page.locator('#run').click();
    await expect(page.locator('.out-text')).toHaveValue(/Three page 2/);
  });

  test('reads a scanned page with OCR', async ({ page }) => {
    test.setTimeout(180_000);
    await openTool(page, 'pdf-to-text');
    await addFiles(page, ['scan.pdf']);
    await page.locator('#run').click();
    await expect(page.locator('.out-text')).toHaveValue(/PDFBURROW/i, { timeout: 150_000 });
  });

  test('makes a scanned PDF searchable', async ({ page }) => {
    test.setTimeout(180_000);
    await openTool(page, 'pdf-to-text');
    await addFiles(page, ['scan.pdf']);
    await page.selectOption('#opt-output', 'searchable');
    await page.locator('#run').click();
    await expect(page.locator('#done')).toBeVisible({ timeout: 150_000 });
    const out = await download(page, '#download');
    expect(await pageCount(out.bytes)).toBe(1);
    expect((await textOf(out.bytes))[0]).toMatch(/PDFBURROW/i);
  });
});

test.describe('home page', () => {
  test('suggests tools for dropped files and hands them over @smoke', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'IndexedDB hand-off of Files times out in Playwright WebKit; works in Chrome and Firefox');
    await page.goto('');
    await page.setInputFiles('#home-input', 'test/e2e/.fixtures/three.pdf');
    await expect(page.locator('#suggest')).toContainText('1 file ready');
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await expect(page).toHaveURL(/compress-pdf\/$/);
    await expect(page.locator('#files .file-name')).toHaveText('three.pdf');
  });

  test('filters tools by search', async ({ page }) => {
    await page.goto('');
    await page.fill('#tool-search', 'password');
    await expect(page.locator('.tool-card:visible')).toHaveCount(2);
    await page.fill('#tool-search', 'zzzz');
    await expect(page.locator('#no-tools')).toBeVisible();
  });

  test('shows the zero-upload counter on every tool page', async ({ page }) => {
    await openTool(page, 'merge-pdf');
    await expect(page.locator('[data-sent]')).toHaveText('0 bytes');
  });
});
