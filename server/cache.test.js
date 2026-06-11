import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache } from './cache.js';

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
