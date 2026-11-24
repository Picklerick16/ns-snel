// Local preview: serves the app and answers API calls from the fake NS replay.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fetchFn } from './fake-ns.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/reisinformatie-api/')) {
    const r = await fetchFn('https://fake' + u.pathname + u.search);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await r.json())); return;
  }
  const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
}).listen(8766, () => console.log('http://localhost:8766'));
