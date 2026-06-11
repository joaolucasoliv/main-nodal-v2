import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './server.js';

async function bootApp(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
const boot = (t) => bootApp(t, createApp());

const postJson = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('GET /api/recommendations/:userId — MISS then HIT, ranked payload', async (t) => {
  const base = await boot(t);
  const r1 = await fetch(`${base}/api/recommendations/you`);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('x-cache'), 'MISS');
  const body = await r1.json();
  assert.equal(body.userId, 'you');
  assert.ok(Array.isArray(body.recommendations) && body.recommendations.length > 0);
  const scores = body.recommendations.map((r) => r.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'results are ranked');

  const r2 = await fetch(`${base}/api/recommendations/you`);
  assert.equal(r2.headers.get('x-cache'), 'HIT');
  assert.match(r2.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await r2.json(), body);
});

test('POST follow invalidates the cache and removes the followed user', async (t) => {
  const base = await boot(t);
  const before = await (await fetch(`${base}/api/recommendations/you`)).json();
  const target = before.recommendations[0].id;

  const follow = await fetch(`${base}/api/users/you/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: target }),
  });
  assert.equal(follow.status, 200);

  const after = await fetch(`${base}/api/recommendations/you`);
  assert.equal(after.headers.get('x-cache'), 'MISS', 'follow must invalidate the cache');
  const ids = (await after.json()).recommendations.map((r) => r.id);
  assert.ok(!ids.includes(target));
});

test('POST interactions records engagement and invalidates', async (t) => {
  const base = await boot(t);
  await fetch(`${base}/api/recommendations/you`);
  const r = await fetch(`${base}/api/users/you/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: 'flavia', type: 'like' }),
  });
  assert.equal(r.status, 200);
  const next = await fetch(`${base}/api/recommendations/you`);
  assert.equal(next.headers.get('x-cache'), 'MISS');
});

test('input validation: bad ids, unknown users, bad types', async (t) => {
  const base = await boot(t);
  assert.equal((await fetch(`${base}/api/recommendations/NOPE$$`)).status, 400);
  assert.equal((await fetch(`${base}/api/recommendations/ghost`)).status, 404);
  const bad = await fetch(`${base}/api/users/you/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: 'flavia', type: 'hack' }),
  });
  assert.equal(bad.status, 400);
});

test('cross-origin POSTs are rejected', async (t) => {
  const base = await boot(t);
  const r = await fetch(`${base}/api/users/you/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ targetId: 'flavia' }),
  });
  assert.equal(r.status, 403);
});

test('POST /api/checkout without configuration returns 501 preview', async (t) => {
  const base = await bootApp(t, createApp({ payments: { config: null } }));
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'monthly' });
  assert.equal(res.status, 501);
  assert.equal((await res.json()).preview, true);
});

test('POST /api/checkout validates plan and cycle', async (t) => {
  const base = await boot(t);
  const badCycle = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'weekly' });
  assert.equal(badCycle.status, 400);
  const badPlan = await postJson(base, '/api/checkout', { plan: 'gold', cycle: 'monthly' });
  assert.equal(badPlan.status, 400);
});

test('POST /api/checkout rejects cross-origin', async (t) => {
  const base = await boot(t);
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'monthly' },
    { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('configured checkout creates a Stripe session via REST', async (t) => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }) };
  };
  const payments = {
    config: { secretKey: 'sk_test_x', prices: { monthly: 'price_m', annual: 'price_a' } },
    fetchImpl: fakeFetch,
  };
  const base = await bootApp(t, createApp({ payments }));
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'annual' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_123');
  assert.equal(captured.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(captured.opts.headers.Authorization, 'Bearer sk_test_x');
  const form = new URLSearchParams(captured.opts.body.toString());
  assert.equal(form.get('mode'), 'subscription');
  assert.equal(form.get('line_items[0][price]'), 'price_a');
  assert.equal(form.get('line_items[0][quantity]'), '1');
  assert.match(form.get('success_url'), /payments\.html\?checkout=success$/);
});

test('static serving: pages resolve, traversal does not', async (t) => {
  const base = await boot(t);
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/payments.html`)).status, 200);
  assert.equal((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status, 404);
  assert.equal((await fetch(`${base}/package.json/../server/server.js`)).status, 404);
});
