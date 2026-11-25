// Page range parsing. Pure functions, unit tested.
//
// Accepts what people type: "1-3, 5, 8-", "2", "-4", "last", "3-last", "all", "odd", "even",
// and reverse ranges like "5-1". Spaces and either "-" or "–" are fine. Pages are 1-based.

const DASH = /\s*[-–—]\s*/;

function pageNumber(token, count) {
  const t = token.trim().toLowerCase();
  if (t === 'last' || t === 'end') return count;
  if (!/^\d+$/.test(t)) return NaN;
  return Number(t);
}

/**
 * Parse a list of ranges into groups of page numbers, keeping the order typed.
 * Returns { groups: number[][], pages: number[], error: string | null }.
 */
export function parseRanges(text, count) {
  const input = String(text ?? '').trim().toLowerCase();
  if (!count || count < 1) return { groups: [], pages: [], error: 'The PDF has no pages.' };
  if (input === '' || input === 'all') {
    const all = Array.from({ length: count }, (_, i) => i + 1);
    return { groups: [all], pages: all, error: null };
  }
  if (input === 'odd' || input === 'even') {
    const pages = Array.from({ length: count }, (_, i) => i + 1).filter((p) => (input === 'odd' ? p % 2 === 1 : p % 2 === 0));
    return pages.length ? { groups: [pages], pages, error: null } : { groups: [], pages: [], error: 'There are no even pages.' };
  }

  const groups = [];
  for (const raw of input.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    let from;
    let to;
    if (DASH.test(part)) {
      const [a, b] = part.split(DASH);
      from = a === '' ? 1 : pageNumber(a, count);
      to = b === '' ? count : pageNumber(b, count);
    } else {
      from = pageNumber(part, count);
      to = from;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { groups: [], pages: [], error: `"${raw.trim()}" is not a page or range. Use numbers like 1-3, 5.` };
    }
    const bad = [from, to].find((p) => p < 1 || p > count);
    if (bad !== undefined) {
      return {
        groups: [],
        pages: [],
        error: `Page ${bad} doesn't exist. This PDF has ${count} page${count === 1 ? '' : 's'}.`,
      };
    }
    const step = from <= to ? 1 : -1;
    const group = [];
    for (let p = from; step > 0 ? p <= to : p >= to; p += step) group.push(p);
    groups.push(group);
  }
  if (!groups.length) return { groups: [], pages: [], error: 'Type at least one page number.' };
  return { groups, pages: groups.flat(), error: null };
}

/** Split [1..count] into chunks of n pages: 7 pages, n=3 -> [[1,2,3],[4,5,6],[7]]. */
export function chunkPages(count, n) {
  const size = Math.max(1, Math.floor(n) || 1);
  const groups = [];
  for (let start = 1; start <= count; start += size) {
    groups.push(Array.from({ length: Math.min(size, count - start + 1) }, (_, i) => start + i));
  }
  return groups;
}

/** [1,2,3,5,7,8] -> "1-3, 5, 7-8" */
export function describePages(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j;
  }
  return parts.join(', ');
}
