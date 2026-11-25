// Lazy loaders for the self-hosted libraries. Nothing here loads until a tool needs it,
// so pages stay light and fast. All files come from this site: no CDN, nothing third-party.

const VENDOR = new URL('../vendor/', import.meta.url);
export const vendorUrl = (path) => new URL(path, VENDOR).href;

function once(load) {
  let promise = null;
  return () => {
    promise ??= load().catch((error) => {
      promise = null;
      throw Object.assign(new Error('A part of the app could not be loaded. Check your connection and try again.'), {
        code: 'load',
        cause: error,
      });
    });
    return promise;
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

export const pdfjs = once(async () => {
  const m = await import(vendorUrl('pdfjs/pdf.min.mjs'));
  m.GlobalWorkerOptions.workerSrc = vendorUrl('pdfjs/pdf.worker.min.mjs');
  return m;
});

export const pdfjsOptions = () => ({
  cMapUrl: vendorUrl('pdfjs/cmaps/'),
  cMapPacked: true,
  standardFontDataUrl: vendorUrl('pdfjs/standard_fonts/'),
  isEvalSupported: false,
});

export const fflate = once(() => import(vendorUrl('fflate/browser.js')));

export const heic2any = once(async () => {
  await loadScript(vendorUrl('heic2any/heic2any.min.js'));
  if (typeof window.heic2any !== 'function') throw new Error('heic2any missing');
  return window.heic2any;
});

export const tesseract = once(async () => {
  await loadScript(vendorUrl('tesseract/tesseract.min.js'));
  if (!window.Tesseract) throw new Error('Tesseract missing');
  return window.Tesseract;
});

export const tesseractOptions = () => ({
  workerPath: vendorUrl('tesseract/worker.min.js'),
  corePath: vendorUrl('tesseract-core'),
  langPath: vendorUrl('tesseract-lang'),
  workerBlobURL: false,
  gzip: true,
});

/** qpdf compiled to WebAssembly. A fresh instance per job: qpdf exits after each command. */
export const qpdfFactory = once(async () => {
  const m = await import(vendorUrl('qpdf/qpdf.mjs'));
  const factory = m.default;
  if (typeof factory !== 'function') throw new Error('qpdf factory missing');
  return factory;
});

export const qpdfWasmUrl = () => vendorUrl('qpdf/qpdf.wasm');
