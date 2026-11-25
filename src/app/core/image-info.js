// Read image size and EXIF orientation from file headers. Pure, unit tested.

/** JPEG: { width, height, orientation (1-8) } or null if not a readable JPEG. */
export function jpegInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  let orientation = 1;
  let width = 0;
  let height = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2 || i + 2 + length > b.length) break;
    const start = i + 4;
    // SOF markers carry the size (C4 = DHT, C8 = JPG, CC = DAC are not SOF).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = (b[start + 1] << 8) | b[start + 2];
      width = (b[start + 3] << 8) | b[start + 4];
    } else if (marker === 0xe1 && length >= 16) {
      orientation = exifOrientation(b, start, start + length - 2) ?? orientation;
    }
    i += 2 + length;
  }
  if (!width || !height) return null;
  return { width, height, orientation };
}

function exifOrientation(b, start, end) {
  // "Exif\0\0" then a TIFF header.
  if (String.fromCharCode(b[start], b[start + 1], b[start + 2], b[start + 3]) !== 'Exif') return null;
  const tiff = start + 6;
  if (tiff + 8 > end) return null;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (o) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k += 1) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** PNG: { width, height } or null. */
export function pngInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const u32 = (o) => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
  const width = u32(16);
  const height = u32(20);
  return width && height ? { width, height } : null;
}

/** Orientations 5-8 swap width and height. */
export function orientedSize(width, height, orientation) {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}
