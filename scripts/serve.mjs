// Minimal static server for dist/, used for local preview and the browser tests.
// Serves the site under BASE_PATH with the right content types (.mjs, .wasm, .webmanifest).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASE_PATH } from '../src/config.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
};

function resolve(urlPath) {
  let path = decodeURIComponent(urlPath.split('?')[0]);
  if (!path.startsWith(BASE_PATH)) return null;
  path = path.slice(BASE_PATH.length);
  const file = normalize(join(dist, path));
  if (!file.startsWith(normalize(dist))) return null; // no escaping dist/
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html');
  return file;
}

createServer((req, res) => {
  const file = resolve(req.url ?? '/');
  if (file && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
    return;
  }
  if (req.url === '/' && BASE_PATH !== '/') {
    res.writeHead(302, { Location: BASE_PATH });
    res.end();
    return;
  }
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  createReadStream(join(dist, '404.html')).pipe(res);
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}${BASE_PATH}`));
