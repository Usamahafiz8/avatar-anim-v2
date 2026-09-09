// Minimal static server for the avatar spike.
// Binds 0.0.0.0 so a phone on the same Wi-Fi can load it — device testing is
// the whole point, desktop numbers tell us nothing about a mid-range Android.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { analyzeFace } from './analyze-face-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const PORT = Number(process.env.PORT ?? 8088);

// Local stand-in for the Netlify/Vercel function at the same "/analyze-face"
// path the client calls in both deployed environments (see netlify.toml's
// redirect and vercel.json's rewrite) — same analyzeFace() core, so `npm run
// serve` with ANTHROPIC_API_KEY set (via `--env-file=.env`, see package.json)
// exercises the exact real path end to end, not a mock.
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
async function handleAnalyzeFace(req, res) {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let body;
  try { body = JSON.parse((await readBody(req)) || '{}'); }
  catch { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON body' })); return; }
  const result = await analyzeFace(body);
  const status = result.error ? (result.clientError ? 400 : 502) : 200;
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(result.error ? result : result.traits));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/analyze-face') { await handleAnalyzeFace(req, res); return; }
    if (p === '/') p = '/index.html';
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(full);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': TYPES[extname(full)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
  }
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`[spike] http://127.0.0.1:${PORT}`);
  for (const ip of ips) console.log(`[spike] http://${ip}:${PORT}   <- open this on your phone`);
});
