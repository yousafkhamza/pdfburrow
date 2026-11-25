// Small DOM helpers. No inline style attributes (blocked by the page's security policy);
// styles go through classes or the CSSOM (el.style.x), which the policy allows.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Screen-reader announcement through the page's live region. */
export function announce(text) {
  const region = document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  // A short delay makes repeated messages announce again.
  setTimeout(() => {
    region.textContent = text;
  }, 50);
}

/** Base path of the site, e.g. "/pdfburrow/" or "/". */
export function basePath() {
  return document.documentElement.dataset.base || '/';
}

export function toolUrl(slug, params = '') {
  return `${basePath()}${slug}/${params}`;
}

/** Wait a frame so the browser can paint progress before heavy work. */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
