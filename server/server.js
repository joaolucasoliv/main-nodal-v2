/* NODAL server: static site + recommendation API.
   Zero dependencies — run with `node server/server.js` (PORT, REDIS_URL optional). */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStore, addFollow, recordInteraction } from './store.js';
import { recommend } from './engine.js';
import { createCache, MemoryCache } from './cache.js';
import { paymentsConfig, createCheckoutSession, CYCLES } from './payments.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const REC_TTL_MS = 5 * 60 * 1000;                 // 5-minute cache, per spec
const ID_RE = /^[a-z0-9-]{1,40}$/;
const INTERACTION_TYPES = new Set(['view', 'like', 'skip', 'message']);
const MAX_BODY = 10 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const recKey = (id) => `rec:v1:${id}`;

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object';
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : headers['Content-Type'] || 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

/* CSRF guard for state-changing requests: same-origin only */
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers['content-type'] ?? '')) {
      reject(Object.assign(new Error('expected application/json'), { status: 415 }));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(Object.assign(new Error('body too large'), { status: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, { error: 'method not allowed' }); return; }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { send(res, 400, { error: 'bad path' }); return; }
  if (decoded.includes('\0')) { send(res, 400, { error: 'bad path' }); return; }

  let filePath = path.normalize(path.join(ROOT, decoded));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) { send(res, 404, { error: 'not found' }); return; }

  // never serve backend source, package metadata, or dotfiles
  const rel = path.relative(ROOT, filePath);
  const segments = rel === '' ? [] : rel.split(path.sep);
  if (segments[0] === 'server' || rel === 'package.json' || segments.some((s) => s.startsWith('.'))) {
    send(res, 404, { error: 'not found' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch { send(res, 404, { error: 'not found' }); return; }

  const type = MIME[path.extname(filePath).toLowerCase()];
  if (!type) { send(res, 404, { error: 'not found' }); return; }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function createApp({ store = createStore(), cache = new MemoryCache(), payments = { config: paymentsConfig(), fetchImpl: fetch } } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

      if (!pathname.startsWith('/api/')) { await serveStatic(req, res, pathname); return; }

      if (req.method === 'GET' && pathname === '/api/health') { send(res, 200, { ok: true }); return; }

      if (req.method === 'GET' && pathname === '/api/users') {
        send(res, 200, { users: [...store.users.values()].map(({ id, name, role, city, interests }) => ({ id, name, role, city, interests })) });
        return;
      }

      let m = pathname.match(/^\/api\/recommendations\/([^/]+)$/);
      if (m && req.method === 'GET') {
        const userId = m[1];
        if (!ID_RE.test(userId)) { send(res, 400, { error: 'invalid user id' }); return; }
        if (!store.users.has(userId)) { send(res, 404, { error: 'unknown user' }); return; }

        const cached = await cache.get(recKey(userId));
        if (cached) {
          send(res, 200, cached, { 'X-Cache': 'HIT', 'Content-Type': 'application/json; charset=utf-8' });
          return;
        }

        const recommendations = recommend(store, userId);
        const payload = { userId, generatedAt: new Date().toISOString(), recommendations };
        await cache.set(recKey(userId), JSON.stringify(payload), REC_TTL_MS);
        send(res, 200, payload, { 'X-Cache': 'MISS' });
        return;
      }

      m = pathname.match(/^\/api\/users\/([^/]+)\/(follow|interactions)$/);
      if (m && req.method === 'POST') {
        if (!sameOrigin(req)) { send(res, 403, { error: 'cross-origin request rejected' }); return; }
        const userId = m[1];
        const action = m[2];
        if (!ID_RE.test(userId) || !store.users.has(userId)) { send(res, 404, { error: 'unknown user' }); return; }

        const body = await readJsonBody(req);
        const targetId = body.targetId;
        if (typeof targetId !== 'string' || !ID_RE.test(targetId) || !store.users.has(targetId) || targetId === userId) {
          send(res, 400, { error: 'invalid targetId' });
          return;
        }

        if (action === 'follow') {
          addFollow(store, userId, targetId);
        } else {
          if (!INTERACTION_TYPES.has(body.type)) { send(res, 400, { error: 'invalid interaction type' }); return; }
          recordInteraction(store, userId, targetId, body.type);
        }

        // graph changed — both parties' recommendations are stale
        await cache.del(recKey(userId), recKey(targetId));
        send(res, 200, { ok: true, userId, targetId, action });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/checkout') {
        if (!sameOrigin(req)) { send(res, 403, { error: 'cross-origin request rejected' }); return; }
        const body = await readJsonBody(req);
        if (body.plan !== 'membership' || !CYCLES.has(body.cycle)) {
          send(res, 400, { error: 'invalid plan or cycle' });
          return;
        }
        if (!payments.config) { send(res, 501, { error: 'payments not configured', preview: true }); return; }
        // PUBLIC_BASE_URL pins the Stripe return URLs in production (Host header is client-supplied)
        const origin = process.env.PUBLIC_BASE_URL ?? `http://${req.headers.host ?? 'localhost'}`;
        const session = await createCheckoutSession({ cycle: body.cycle, origin }, payments.config, payments.fetchImpl);
        send(res, 200, session);
        return;
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error('request error:', err);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? 'internal error' : err.message });
      else res.end();
    }
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));
  process.on('uncaughtException', (err) => { console.error('uncaught exception:', err); process.exit(1); });

  const port = Number(process.env.PORT || 4173);
  const cache = await createCache();
  createApp({ cache }).listen(port, () => {
    console.log(`NODAL serving site + API on http://localhost:${port}`);
  });
}
