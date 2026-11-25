// Detect what a file really is from its first bytes, not its name. Pure, unit tested.

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * @param {Uint8Array} head  at least the first 32 bytes of the file
 * @param {string} name      file name, used only as a fallback
 * @returns {'pdf'|'jpg'|'png'|'webp'|'gif'|'bmp'|'heic'|'unknown'}
 */
export function detectKind(head, name = '') {
  const b = head instanceof Uint8Array ? head : new Uint8Array(head ?? []);
  if (b.length >= 5) {
    // "%PDF-" can appear after a little junk; the spec allows it within the first 1024 bytes.
    const text = ascii(b, 0, Math.min(b.length, 1024));
    if (text.includes('%PDF-')) return 'pdf';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif'].includes(brand)) {
      return brand === 'avif' ? 'unknown' : 'heic';
    }
  }
  const ext = String(name).toLowerCase().split('.').pop();
  if (ext === 'heic' || ext === 'heif') return 'heic';
  return 'unknown';
}

export const IMAGE_KINDS = ['jpg', 'png', 'webp', 'gif', 'bmp', 'heic'];

export function isImage(kind) {
  return IMAGE_KINDS.includes(kind);
}

/** What a tool's file picker should accept. */
export function acceptAttribute(kinds) {
  const parts = [];
  if (kinds.includes('pdf')) parts.push('.pdf', 'application/pdf');
  if (kinds.includes('image')) parts.push('image/*', '.heic', '.heif');
  return parts.join(',');
}
