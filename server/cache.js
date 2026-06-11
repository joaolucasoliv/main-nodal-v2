/* TTL cache for recommendation results.
   Redis (REDIS_URL) when available — minimal RESP client, zero dependencies —
   otherwise an in-memory Map with the same async interface. Cache failures
   degrade to misses; they never take the API down. */

import net from 'node:net';

export class MemoryCache {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.store = new Map();
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires <= this.now()) { this.store.delete(key); return null; }
    return entry.value;
  }
  async set(key, value, ttlMs) {
    this.store.set(key, { value, expires: this.now() + ttlMs });
  }
  async del(...keys) {
    for (const key of keys) this.store.delete(key);
  }
}

export class RedisCache {
  constructor(url) {
    const u = new URL(url);
    this.host = u.hostname || '127.0.0.1';
    this.port = Number(u.port || 6379);
    this.sock = null;
    this.dead = false;
    this.pending = [];      // FIFO resolvers, one per in-flight command
    this.buf = Buffer.alloc(0);
  }

  connect(timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => { sock.destroy(); reject(new Error('redis connect timeout')); }, timeoutMs);
      sock.once('connect', () => { clearTimeout(timer); this.sock = sock; resolve(); });
      sock.once('error', (err) => { clearTimeout(timer); this.dead = true; reject(err); });
      sock.on('data', (chunk) => this.#feed(chunk));
      sock.on('close', () => {
        this.dead = true;
        while (this.pending.length) this.pending.shift()(null);
      });
    });
  }

  #feed(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    let parsed;
    while (this.pending.length && (parsed = this.#parse()) !== undefined) {
      this.pending.shift()(parsed);
    }
  }

  /* parse a single RESP reply off the front of the buffer;
     returns undefined when the reply is still incomplete */
  #parse() {
    const nl = this.buf.indexOf('\r\n');
    if (nl === -1) return undefined;
    const head = this.buf.subarray(0, nl).toString();
    const type = head[0];
    const rest = head.slice(1);
    if (type === '+' || type === ':') { this.buf = this.buf.subarray(nl + 2); return rest; }
    if (type === '-') { this.buf = this.buf.subarray(nl + 2); return null; }
    if (type === '$') {
      const len = Number(rest);
      if (len === -1) { this.buf = this.buf.subarray(nl + 2); return null; }
      const end = nl + 2 + len + 2;
      if (this.buf.length < end) return undefined;
      const value = this.buf.subarray(nl + 2, nl + 2 + len).toString();
      this.buf = this.buf.subarray(end);
      return value;
    }
    // unexpected type — drop the line and treat as a miss
    this.buf = this.buf.subarray(nl + 2);
    return null;
  }

  #cmd(...args) {
    if (this.dead || !this.sock) return Promise.resolve(null);
    const payload = [`*${args.length}`, ...args.flatMap((a) => [`$${Buffer.byteLength(a)}`, a])].join('\r\n') + '\r\n';
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.sock.write(payload, (err) => { if (err) { this.dead = true; resolve(null); } });
    });
  }

  async get(key) { return this.#cmd('GET', key); }
  async set(key, value, ttlMs) { await this.#cmd('SET', key, value, 'PX', String(ttlMs)); }
  async del(...keys) { if (keys.length) await this.#cmd('DEL', ...keys); }
}

export async function createCache(log = console) {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const redis = new RedisCache(url);
      await redis.connect();
      log.log(`cache: redis at ${redis.host}:${redis.port}`);
      return redis;
    } catch (err) {
      log.warn(`cache: redis unavailable (${err.message}) — falling back to in-memory TTL cache`);
    }
  }
  return new MemoryCache();
}
