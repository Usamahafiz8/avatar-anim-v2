// Minimal static server for the avatar spike.
// Binds 0.0.0.0 so a phone on the same Wi-Fi can load it — device testing is
// the whole point, desktop numbers tell us nothing about a mid-range Android.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { handleAnalyzeFaceRequest, MAX_IMAGE_BYTES } from './analyze-face-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const PORT = Number(process.env.PORT ?? 8088);

// No dotenv dependency for one optional local-only variable — a `.env` file
// with GEMINI_API_KEY=... in the repo root is enough for `node serve.mjs` to
// pick it up, same as Vercel/Netlify's own dashboard-set env var in
// production. Silently does nothing if the file doesn't exist (most days of
// local dev don't need the Gemini tier at all — see analyseSelfie's notes).
try {
  const envText = await readFile(join(ROOT, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    // A `#`-prefixed comment line never matches `[\w.-]+` as the key, so it
    // already fails this match and is skipped — no separate comment check needed.
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    if (!(key in process.env)) process.env[key] = val.replace(/^["']|["']$/g, '');
  }
} catch {}

// Mirrors api/analyze-face.js (Vercel) / netlify/functions/analyze-face.js —
// same shared handleAnalyzeFaceRequest (validation + Gemini call + status
// mapping), so `node serve.mjs` exercises the exact same behaviour locally
// instead of only being testable after a deploy. Reads the key from the
// process env (e.g. `GEMINI_API_KEY=... node serve.mjs`, or the .env loader
// above) — never sent to the client. Only the request/response plumbing
// (reading the raw body, writing Node's http response) is specific to this
// file; Vercel/Netlify have their own equivalent plumbing around the same call.
async function handleAnalyzeFace(req, res) {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_IMAGE_BYTES * 2) { res.writeHead(413).end('image too large'); return; }
  }
  let parsedBody;
  try { parsedBody = JSON.parse(raw); } catch { res.writeHead(400).end('invalid json'); return; }

  const { status, body } = await handleAnalyzeFaceRequest(parsedBody, process.env.GEMINI_API_KEY);
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
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
    if (p === '/api/analyze-face') { await handleAnalyzeFace(req, res); return; }
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
