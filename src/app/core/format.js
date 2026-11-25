// Formatting helpers. Pure functions, unit tested.

/** 1536 -> "1.5 KB". Uses 1024 steps, like file managers on Windows and most upload forms. */
export function formatBytes(bytes) {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, '')} ${units[unit]}`;
}

/** Percent change, e.g. 2.4 MB -> 186 KB = "-92%". */
export function formatChange(before, after) {
  if (!(before > 0)) return '0%';
  const pct = Math.round(((after - before) / before) * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
}

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Report (final).PDF" -> "Report (final)" */
export function baseName(name) {
  const clean = String(name ?? '').split(/[\\/]/).pop() || 'document';
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(0, dot) : clean;
}

/**
 * A safe file name for downloads: keeps letters (any language), digits, spaces, dashes,
 * underscores, dots and brackets; removes path separators and control characters.
 */
export function safeFileName(name, extension) {
  let base = baseName(name)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!base || /^\.+$/.test(base)) base = 'document';
  const ext = extension ? `.${String(extension).replace(/^\./, '')}` : '';
  return `${base}${ext}`;
}

/** "invoice.pdf" + "compressed" -> "invoice-compressed.pdf" */
export function suffixName(name, suffix, extension = 'pdf') {
  return safeFileName(`${baseName(name)}-${suffix}`, extension);
}
