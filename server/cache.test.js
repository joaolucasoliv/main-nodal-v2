import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache, RedisCache } from './cache.js';

test('memory cache: set/get roundtrip within TTL', async () => {
  let t = 0;
  const cache = new MemoryCache({ now: () => t });
  await cache.set('k', 'v', 300_000);
  assert.equal(await cache.get('k'), 'v');
});

test('memory cache: entries expire after the TTL', async () => {
  let t = 0;
  const cache = new MemoryCache({ now: () => t });
  await cache.set('k', 'v', 300_000);
  t = 299_999;
  assert.equal(await cache.get('k'), 'v');
  t = 300_000;
  assert.equal(await cache.get('k'), null);
});

test('memory cache: del invalidates multiple keys', async () => {
  const cache = new MemoryCache();
  await cache.set('a', '1', 60_000);
  await cache.set('b', '2', 60_000);
  await cache.del('a', 'b');
  assert.equal(await cache.get('a'), null);
  assert.equal(await cache.get('b'), null);
});

test('redis cache preserves TLS, auth, and database settings from REDIS_URL', () => {
  const cache = new RedisCache('rediss://user:p%40ss@redis.example:6380/2');
  assert.equal(cache.tls, true);
  assert.equal(cache.host, 'redis.example');
  assert.equal(cache.port, 6380);
  assert.equal(cache.username, 'user');
  assert.equal(cache.password, 'p@ss');
  assert.equal(cache.db, '2');
});
