// Saving results, zipping several, passing a file to the next tool, and the upload guard.
import { fflate } from './libs.js';

/** Start a download. The object URL is revoked after a minute. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Unique names inside a zip: "a.pdf", "a (2).pdf"… */
export function uniqueNames(names) {
  const used = new Map();
  return names.map((name) => {
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    if (!count) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}` : `${name} (${count + 1})`;
  });
}

export async function zip(files) {
  const { zipSync } = await fflate();
  const names = uniqueNames(files.map((f) => f.name));
  const entries = {};
  for (let i = 0; i < files.length; i += 1) {
    const data = new Uint8Array(await files[i].blob.arrayBuffer());
    // PDFs and JPEGs are already compressed; storing is faster and almost as small.
    entries[names[i]] = [data, { level: 0 }];
  }
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

// ---- Handing a result to the next tool (stays on this device, in IndexedDB) ----

const DB = 'pdfburrow';
const STORE = 'handoff';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Keep files for the next tool page. files: [{ blob, name }] */
export async function handOff(files) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ files: files.map((f) => ({ blob: f.blob, name: f.name })), at: Date.now() }, 'next');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Take the handed-off files (once). Returns File[]. Hand-offs older than 10 minutes are dropped. */
export async function takeHandOff() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get('next');
      req.onsuccess = () => {
        store.delete('next');
        resolve(req.result ?? null);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record?.files || Date.now() - record.at > 10 * 60_000) return [];
    return record.files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/pdf' }));
  } catch {
    return [];
  }
}

// ---- Upload guard: counts file data the page tries to send anywhere ----

let sentBytes = 0;
const listeners = new Set();

function sizeOfBody(body) {
  if (!body) return 0;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    let n = 0;
    for (const [, v] of body.entries()) if (v instanceof Blob) n += v.size;
    return n;
  }
  return 0; // plain text (e.g. analytics strings) is not file data
}

function record(body) {
  const n = sizeOfBody(body);
  if (n > 0) {
    sentBytes += n;
    for (const fn of listeners) fn(sentBytes);
  }
}

/** Wrap fetch, XHR and sendBeacon so any attempt to send file data is counted and shown. */
export function installUploadGuard() {
  if (window.__pdfburrowGuard) return;
  window.__pdfburrowGuard = true;
  const originalFetch = window.fetch;
  window.fetch = function guardedFetch(input, init) {
    if (init?.body) record(init.body);
    else if (input instanceof Request && input.method !== 'GET' && input.method !== 'HEAD') record(input.body ? new Blob([]) : null);
    return originalFetch.apply(this, arguments);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function guardedSend(body) {
    record(body);
    return send.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      record(data);
      return beacon(url, data);
    };
  }
}

export function onUpload(fn) {
  listeners.add(fn);
  fn(sentBytes);
  return () => listeners.delete(fn);
}
