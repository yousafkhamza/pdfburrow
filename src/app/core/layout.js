// Page geometry. Pure functions, unit tested.
//
// Two coordinate spaces matter:
//   user space    — the PDF's own coordinates, origin bottom-left of the unrotated page
//   display space — the page as people see it after /Rotate, origin bottom-left
// Tools think in display space ("bottom-right corner") and convert with toUserSpace.

export const PT_PER_MM = 72 / 25.4;
export const mm = (value) => value * PT_PER_MM;

export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'US Letter' },
  legal: { width: 612, height: 1008, label: 'US Legal' },
  a5: { width: 419.53, height: 595.28, label: 'A5' },
};

export function normalizeRotation(angle) {
  return ((Math.round((angle || 0) / 90) * 90) % 360 + 360) % 360;
}

/** Size of the page as people see it. */
export function displaySize(width, height, rotation) {
  const r = normalizeRotation(rotation);
  return r === 90 || r === 270 ? { width: height, height: width } : { width, height };
}

/**
 * Convert a display-space point to user space.
 * width/height are the unrotated (user space) page size.
 */
export function toUserSpace(width, height, rotation, dx, dy) {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: width - dy, y: dx };
    case 180:
      return { x: width - dx, y: height - dy };
    case 270:
      return { x: dy, y: height - dx };
    default:
      return { x: dx, y: dy };
  }
}

/** Inverse of toUserSpace. */
export function toDisplaySpace(width, height, rotation, ux, uy) {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: uy, y: width - ux };
    case 180:
      return { x: width - ux, y: height - uy };
    case 270:
      return { x: height - uy, y: ux };
    default:
      return { x: ux, y: uy };
  }
}

export const POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/** Bottom-left corner of a box placed at a named position on a page (display space). */
export function positionBox(pageWidth, pageHeight, boxWidth, boxHeight, position = 'bottom-center', margin = 24) {
  const [v, h] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const x = h === 'left' ? margin : h === 'right' ? pageWidth - margin - boxWidth : (pageWidth - boxWidth) / 2;
  const y = v === 'top' ? pageHeight - margin - boxHeight : v === 'bottom' ? margin : (pageHeight - boxHeight) / 2;
  return { x, y };
}

/** Scale (w, h) to fit inside (maxW, maxH) keeping the aspect ratio. Never upscales unless allowed. */
export function fitInside(width, height, maxWidth, maxHeight, upscale = true) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, scale: 0 };
  let scale = Math.min(maxWidth / width, maxHeight / height);
  if (!upscale) scale = Math.min(scale, 1);
  return { width: width * scale, height: height * scale, scale };
}

/**
 * Page size for an image page.
 * size: 'fit' (page = image at 96 dpi), 'a4', 'letter', 'legal'
 * orientation: 'auto' (follows the image), 'portrait', 'landscape'
 * margin: in points
 */
export function imagePage(imageWidth, imageHeight, { size = 'a4', orientation = 'auto', margin = 0 } = {}) {
  if (size === 'fit') {
    const w = imageWidth * 0.75; // px at 96 dpi -> pt
    const h = imageHeight * 0.75;
    return { pageWidth: w + margin * 2, pageHeight: h + margin * 2, x: margin, y: margin, width: w, height: h };
  }
  const base = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
  const landscape = orientation === 'landscape' || (orientation === 'auto' && imageWidth > imageHeight);
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;
  const box = fitInside(imageWidth, imageHeight, pageWidth - margin * 2, pageHeight - margin * 2, true);
  return {
    pageWidth,
    pageHeight,
    x: (pageWidth - box.width) / 2,
    y: (pageHeight - box.height) / 2,
    width: box.width,
    height: box.height,
  };
}

export const CARD_SIZES = {
  id: { width: 85.6, height: 53.98, label: 'ID card or driving licence (85.6 × 54 mm)' },
  passport: { width: 125, height: 88, label: 'Passport photo page (125 × 88 mm)' },
};

/**
 * Two images (front and back) on one page, one in the top half and one in the bottom half.
 * card: 'id' | 'passport' -> true physical size; 'fill' -> as large as fits each half.
 * Returns boxes in points, origin bottom-left, for each image.
 */
export function idScanLayout(pageSize, card, images) {
  const page = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4;
  const margin = mm(15);
  const gap = mm(12);
  const halfHeight = (page.height - margin * 2 - gap) / 2;
  const maxWidth = page.width - margin * 2;
  const boxes = images.map((img, i) => {
    let size;
    if (CARD_SIZES[card]) {
      const c = CARD_SIZES[card];
      // Match the card's orientation to the image's.
      const landscape = img.width >= img.height;
      const w = mm(landscape ? c.width : c.height);
      const h = mm(landscape ? c.height : c.width);
      size = fitInside(w, h, maxWidth, halfHeight, false);
    } else {
      size = fitInside(img.width, img.height, maxWidth, halfHeight, true);
    }
    const top = page.height - margin - (i === 0 ? 0 : halfHeight + gap);
    return {
      x: (page.width - size.width) / 2,
      y: top - halfHeight + (halfHeight - size.height) / 2,
      width: size.width,
      height: size.height,
    };
  });
  return { width: page.width, height: page.height, boxes };
}

/** Page number label. format: 'n' | 'page-n' | 'page-n-of-total' | 'n-of-total' */
export function pageLabel(format, n, total) {
  switch (format) {
    case 'page-n':
      return `Page ${n}`;
    case 'page-n-of-total':
      return `Page ${n} of ${total}`;
    case 'n-of-total':
      return `${n} / ${total}`;
    default:
      return String(n);
  }
}

/**
 * Crop a box by margins (points) given in display terms (top/right/bottom/left as seen).
 * Returns the new box in user space, or null if the margins leave nothing.
 */
export function cropBox(box, rotation, margins) {
  const r = normalizeRotation(rotation);
  // Map display-side margins to user-space sides.
  const { top = 0, right = 0, bottom = 0, left = 0 } = margins;
  const sides = {
    0: { l: left, r: right, b: bottom, t: top },
    // 90°: display left = user bottom, display top = user left (see toDisplaySpace).
    90: { l: top, r: bottom, b: left, t: right },
    180: { l: right, r: left, b: top, t: bottom },
    270: { l: bottom, r: top, b: right, t: left },
  }[r];
  const width = box.width - sides.l - sides.r;
  const height = box.height - sides.b - sides.t;
  if (width < 10 || height < 10) return null;
  return { x: box.x + sides.l, y: box.y + sides.b, width, height };
}
