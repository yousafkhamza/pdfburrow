// Helpers shared by tools.
import { baseName, safeFileName } from '../core/format.js';
import { parseRanges } from '../core/ranges.js';
import { bytesOf } from '../files.js';

export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });

export function pdfFile(name, bytes) {
  return { name: safeFileName(name, 'pdf'), blob: pdfBlob(bytes) };
}

/** Name for an output: "report.pdf" + "signed" -> "report-signed.pdf". */
export function outName(entry, suffix, ext = 'pdf') {
  return safeFileName(`${baseName(entry.name)}-${suffix}`, ext);
}

export function inputError(message) {
  return Object.assign(new Error(message), { code: 'input' });
}

/** A copy of the file's bytes, safe to transfer to the worker. */
export async function copyBytes(entry) {
  return (await bytesOf(entry)).slice();
}

/** Pages from a "Pages" field: "all" or empty -> null (every page); otherwise a list or an error. */
export function pagesOption(text, count) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t || t === 'all') return null;
  const r = parseRanges(t, count);
  if (r.error) throw inputError(r.error);
  return [...new Set(r.pages)];
}

/** Same check for ready(): returns true or a message. */
export function pagesProblem(text, count) {
  try {
    pagesOption(text, count);
    return true;
  } catch (error) {
    return error.message;
  }
}
