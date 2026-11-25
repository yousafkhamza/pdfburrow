// Creates the test files once per run: PDFs (text, form, secret, photo-heavy, scanned) and images.
// Real JPEGs and a "scanned" page are drawn by a browser, so they are real-world files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

import { FIXTURES, fixture } from './paths.js';
import { makePdf, PDFLib, png } from '../helpers.js';

async function browserImages() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const result = await page.evaluate(async () => {
    const toB64 = (canvas, type, q) => canvas.toDataURL(type, q).split(',')[1];
    // A detailed "photo": gradients and noise, which compresses poorly, like a real camera photo.
    const photo = document.createElement('canvas');
    photo.width = 2400;
    photo.height = 1800;
    const g = photo.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 2400, 1800);
    grad.addColorStop(0, '#3a6ea5');
    grad.addColorStop(1, '#e0a458');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2400, 1800);
    const img = g.getImageData(0, 0, 2400, 1800);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 90;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // A "scanned" page: an image of text, with no text layer.
    const scan = document.createElement('canvas');
    scan.width = 1240;
    scan.height = 1754;
    const s = scan.getContext('2d');
    s.fillStyle = '#fff';
    s.fillRect(0, 0, 1240, 1754);
    s.fillStyle = '#111';
    s.font = 'bold 96px Arial, sans-serif';
    s.fillText('HELLO PDFBURROW', 120, 300);
    s.font = '56px Arial, sans-serif';
    s.fillText('Scanned invoice number 4471', 120, 460);
    return { photo: toB64(photo, 'image/jpeg', 0.95), scan: toB64(scan, 'image/png') };
  });
  await browser.close();
  return { photo: Buffer.from(result.photo, 'base64'), scan: Buffer.from(result.scan, 'base64') };
}

export default async function globalSetup() {
  mkdirSync(FIXTURES, { recursive: true });
  const { photo, scan } = await browserImages();
  writeFileSync(fixture('photo.jpg'), photo);
  writeFileSync(fixture('image.png'), png(400, 300, { rgb: [47, 91, 234] }));
  writeFileSync(fixture('notes.txt'), 'This is not a PDF.');

  writeFileSync(fixture('three.pdf'), await makePdf({ pages: 3, text: (i) => `Three page ${i + 1}` }));
  writeFileSync(fixture('five.pdf'), await makePdf({ pages: 5, text: (i) => `Five page ${i + 1}` }));
  writeFileSync(fixture('meta.pdf'), await makePdf({ pages: 1, author: 'Jane Secretname' }));
  writeFileSync(
    fixture('secret.pdf'),
    await makePdf({ pages: 3, text: (i) => (i === 1 ? 'Account SECRET-123456 belongs to Jane' : `Public page ${i + 1}`) }),
  );

  // A form.
  {
    const doc = await PDFLib.PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const form = doc.getForm();
    form.createTextField('applicant.fullName').addToPage(page, { x: 60, y: 700, width: 300, height: 24 });
    form.createCheckBox('agree').addToPage(page, { x: 60, y: 650, width: 16, height: 16 });
    const country = form.createDropdown('country');
    country.addOptions(['UAE', 'India', 'UK']);
    country.addToPage(page, { x: 60, y: 600, width: 200, height: 24 });
    writeFileSync(fixture('form.pdf'), await doc.save());
  }

  // A photo-heavy PDF (about 1-2 MB), with a line of real text.
  {
    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    for (let i = 0; i < 2; i += 1) {
      const page = doc.addPage([595, 842]);
      const img = await doc.embedJpg(photo);
      page.drawImage(img, { x: 40, y: 300, width: 515, height: 386 });
      page.drawText(`Photo report page ${i + 1}`, { x: 40, y: 760, size: 20, font });
    }
    writeFileSync(fixture('photo.pdf'), await doc.save());
  }

  // A scanned page: image only, no text layer.
  {
    const doc = await PDFLib.PDFDocument.create();
    const img = await doc.embedPng(scan);
    doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    writeFileSync(fixture('scan.pdf'), await doc.save());
  }
}
