import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { createApp, createCitySearch, validateRuntimeConfig } from './server.js';
import { createStore } from './store.js';
import { createDatabase } from './db.js';

const LIVE_STRIPE_SECRET = ['sk', 'live', 'abc123'].join('_');
const LIVE_STRIPE_WEBHOOK_SECRET = ['whsec', 'live123'].join('_');

async function bootApp(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
const boot = (t) => bootApp(t, createApp({ store: createStore() }));
async function bootDbHandle(t, options = {}) {
  const db = createDatabase({ filename: ':memory:' });
  t.after(() => db.close());
  const serverOptions = { ...options, db };
  return { db, base: await bootApp(t, createApp(serverOptions)) };
}
const bootDb = async (t) => (await bootDbHandle(t)).base;

const postJson = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const patchJson = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const cookiePair = (res) => res.headers.get('set-cookie').split(';')[0];

const stripeSignature = (payload, secret, timestamp = Math.floor(Date.now() / 1000)) => {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
};

function rawRequest(base, { path = '/', headers = {} } = {}) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: url.hostname,
      port: Number(url.port),
      method: 'GET',
      path,
      headers,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

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
    body: JSON.stringify({ targetId: 'flavia', type: 'skip' }),
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
    body: JSON.stringify({ targetId: 'flavia', type: 'message' }),
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

test('POST /api/checkout without configuration returns 501', async (t) => {
  const base = await bootApp(t, createApp({ store: createStore(), payments: { config: null } }));
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'monthly' });
  assert.equal(res.status, 501);
  assert.equal((await res.json()).error, 'payments not configured');
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
  const oldBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://nodal.example';
  t.after(() => {
    if (oldBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = oldBaseUrl;
  });
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }) };
  };
  const payments = {
    config: { secretKey: 'sk_test_x', prices: { monthly: 'price_m', annual: 'price_a' } },
    fetchImpl: fakeFetch,
  };
  const base = await bootApp(t, createApp({ store: createStore(), payments }));
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'annual' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_123');
  assert.equal(captured.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(captured.opts.headers.Authorization, 'Bearer sk_test_x');
  const form = new URLSearchParams(captured.opts.body.toString());
  assert.equal(form.get('mode'), 'subscription');
  assert.equal(form.get('client_reference_id'), 'local');
  assert.equal(form.get('metadata[nodal_user_id]'), 'local');
  assert.equal(form.get('line_items[0][price]'), 'price_a');
  assert.equal(form.get('line_items[0][quantity]'), '1');
  assert.equal(form.get('success_url'), 'https://nodal.example/payments.html?checkout=success');
});

test('authenticated checkout sends user metadata and customer email to Stripe', async (t) => {
  const oldBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://nodal.example';
  t.after(() => {
    if (oldBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = oldBaseUrl;
  });
  let captured;
  const payments = {
    config: {
      secretKey: 'sk_test_x',
      webhookSecret: 'whsec_test',
      prices: { monthly: 'price_m', annual: 'price_a' },
    },
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_user' }) };
    },
  };
  const { base } = await bootDbHandle(t, { payments });
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Paying Member',
    email: 'paying@example.com',
    password: 'correct-horse',
  });
  const user = (await signup.clone().json()).user;
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'monthly' }, { Cookie: cookiePair(signup) });
  assert.equal(res.status, 200);
  const form = new URLSearchParams(captured.opts.body.toString());
  assert.equal(form.get('client_reference_id'), user.id);
  assert.equal(form.get('metadata[nodal_user_id]'), user.id);
  assert.equal(form.get('subscription_data[metadata][nodal_user_id]'), user.id);
  assert.equal(form.get('customer_email'), 'paying@example.com');
});

test('configured checkout fails closed without PUBLIC_BASE_URL', async (t) => {
  const oldBaseUrl = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  t.after(() => {
    if (oldBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = oldBaseUrl;
  });
  let called = false;
  const payments = {
    config: { secretKey: 'sk_test_x', prices: { monthly: 'price_m', annual: 'price_a' } },
    fetchImpl: async () => { called = true; throw new Error('should not call provider'); },
  };
  const base = await bootApp(t, createApp({ store: createStore(), payments }));
  const res = await postJson(base, '/api/checkout', { plan: 'membership', cycle: 'monthly' });
  assert.equal(res.status, 500);
  assert.equal(called, false);
});

test('Stripe webhook must be signed before subscription status changes', async (t) => {
  const secret = 'whsec_test_secret';
  const payments = {
    config: {
      secretKey: 'sk_test_x',
      webhookSecret: secret,
      prices: { monthly: 'price_m', annual: 'price_a' },
    },
    fetchImpl: async () => { throw new Error('not used'); },
  };
  const { base } = await bootDbHandle(t, { payments });
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Webhook Member',
    email: 'webhook@example.com',
    password: 'correct-horse',
  });
  const user = (await signup.clone().json()).user;
  const cookie = cookiePair(signup);
  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_verified',
        client_reference_id: user.id,
        customer: 'cus_verified',
        subscription: 'sub_verified',
        payment_status: 'paid',
      },
    },
  });

  const spoof = await fetch(`${base}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': 't=1,v1=bad' },
    body: payload,
  });
  assert.equal(spoof.status, 400);
  let status = await (await fetch(`${base}/api/billing/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.subscription.status, 'none');

  const signed = await fetch(`${base}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': stripeSignature(payload, secret) },
    body: payload,
  });
  assert.equal(signed.status, 200);
  status = await (await fetch(`${base}/api/billing/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.subscription.status, 'active');
  assert.equal(status.subscription.active, true);
});

test('Stripe webhook ignores duplicate and older subscription events', async (t) => {
  const secret = 'whsec_test_secret';
  const payments = {
    config: {
      secretKey: 'sk_test_x',
      webhookSecret: secret,
      prices: { monthly: 'price_m', annual: 'price_a' },
    },
    fetchImpl: async () => { throw new Error('not used'); },
  };
  const { base } = await bootDbHandle(t, { payments });
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Ordered Webhook Member',
    email: 'ordered-webhook@example.com',
    password: 'correct-horse',
  });
  const user = (await signup.clone().json()).user;
  const cookie = cookiePair(signup);

  const sendStripe = (event) => {
    const payload = JSON.stringify(event);
    return fetch(`${base}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature(payload, secret) },
      body: payload,
    });
  };

  const activeEvent = {
    id: 'evt_newer_active',
    created: 200,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_ordered',
        client_reference_id: user.id,
        customer: 'cus_ordered',
        subscription: 'sub_ordered',
        payment_status: 'paid',
      },
    },
  };
  assert.equal((await sendStripe(activeEvent)).status, 200);
  assert.equal((await sendStripe(activeEvent)).status, 200);

  const olderDeletedEvent = {
    id: 'evt_older_deleted',
    created: 100,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_ordered',
        customer: 'cus_ordered',
        status: 'canceled',
        current_period_end: 100,
        metadata: { nodal_user_id: user.id },
      },
    },
  };
  assert.equal((await sendStripe(olderDeletedEvent)).status, 200);
  const status = await (await fetch(`${base}/api/billing/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.subscription.status, 'active');
  assert.equal(status.subscription.active, true);
});

test('production runtime config fails closed when deploy-critical env is missing', () => {
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'preview',
  }), /DATABASE_PATH/);
  assert.doesNotThrow(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'sqlite',
    DATABASE_PATH: '/var/lib/nodal/nodal.sqlite',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'preview',
  }));
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'supabase',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'preview',
  }), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    VERCEL: '1',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'preview',
  }), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'supabase',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
    SUPABASE_SECRET_KEY: 'sb_secret_server123',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'live',
    STRIPE_SECRET_KEY: LIVE_STRIPE_SECRET,
    STRIPE_PRICE_MONTHLY: 'price_monthly123',
    STRIPE_PRICE_ANNUAL: 'price_annual123',
    STRIPE_WEBHOOK_SECRET: LIVE_STRIPE_WEBHOOK_SECRET,
  }), /SUBSCRIPTION_PRICE_MONTHLY_LABEL/);
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'supabase',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
    SUPABASE_SECRET_KEY: 'sb_secret_server123',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'live',
    STRIPE_SECRET_KEY: `${LIVE_STRIPE_SECRET} extra`,
    STRIPE_PRICE_MONTHLY: 'price_monthly123',
    STRIPE_PRICE_ANNUAL: 'price_annual123',
    STRIPE_WEBHOOK_SECRET: LIVE_STRIPE_WEBHOOK_SECRET,
    SUBSCRIPTION_PRICE_MONTHLY_LABEL: 'US$10',
    SUBSCRIPTION_PRICE_ANNUAL_LABEL: 'US$100',
  }), /invalid Stripe secret key format/);
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'supabase',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
    SUPABASE_SECRET_KEY: 'sb_secret_server123',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'live',
    STRIPE_SECRET_KEY: 'sk_test_abc123',
    STRIPE_PRICE_MONTHLY: 'price_monthly123',
    STRIPE_PRICE_ANNUAL: 'price_annual123',
    STRIPE_WEBHOOK_SECRET: LIVE_STRIPE_WEBHOOK_SECRET,
    SUBSCRIPTION_PRICE_MONTHLY_LABEL: 'US$10',
    SUBSCRIPTION_PRICE_ANNUAL_LABEL: 'US$100',
  }), /live Stripe secret key/);
  assert.doesNotThrow(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATA_BACKEND: 'supabase',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
    SUPABASE_SECRET_KEY: 'sb_secret_server123',
    PUBLIC_BASE_URL: 'https://nodal.example',
    COOKIE_SECURE: 'true',
    PAYMENTS_MODE: 'live',
    STRIPE_SECRET_KEY: LIVE_STRIPE_SECRET,
    STRIPE_PRICE_MONTHLY: 'price_monthly123',
    STRIPE_PRICE_ANNUAL: 'price_annual123',
    STRIPE_WEBHOOK_SECRET: LIVE_STRIPE_WEBHOOK_SECRET,
    SUBSCRIPTION_PRICE_MONTHLY_LABEL: 'US$10',
    SUBSCRIPTION_PRICE_ANNUAL_LABEL: 'US$100',
  }));
});

test('billing config is served from environment, not frontend literals', async (t) => {
  const keys = [
    'SUBSCRIPTION_PRICE_MONTHLY_LABEL',
    'SUBSCRIPTION_MONTHLY_PERIOD',
    'SUBSCRIPTION_PRICE_ANNUAL_LABEL',
    'SUBSCRIPTION_ANNUAL_PERIOD',
    'SUBSCRIPTION_ANNUAL_BADGE',
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.SUBSCRIPTION_PRICE_MONTHLY_LABEL = 'US$12';
  process.env.SUBSCRIPTION_MONTHLY_PERIOD = '/ month';
  process.env.SUBSCRIPTION_PRICE_ANNUAL_LABEL = 'US$120';
  process.env.SUBSCRIPTION_ANNUAL_PERIOD = '/ year';
  process.env.SUBSCRIPTION_ANNUAL_BADGE = 'configured annual';
  t.after(() => {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  });
  const base = await boot(t);
  const res = await fetch(`${base}/api/billing/config`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cycles.monthly.amount, 'US$12');
  assert.equal(body.cycles.monthly.per, '/ month');
  assert.equal(body.cycles.annual.amount, 'US$120');
  assert.equal(body.cycles.annual.per, '/ year');
  assert.equal(body.cycles.annual.badge, 'configured annual');
});

test('landing membership price is loaded from billing config instead of a hardcoded amount', async (t) => {
  const base = await boot(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /data-billing-price/);
  assert.doesNotMatch(html, /US\$\d+/);
});

test('city search proxies global city provider for authenticated profile autocomplete', async (t) => {
  let captured;
  const citySearch = createCitySearch({
    baseUrl: 'https://city-provider.example/search',
    minIntervalMs: 0,
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        json: async () => ([
          {
            lat: '-21.4647310',
            lon: '-47.0024050',
            name: 'Mococa',
            city: 'Mococa',
            region: 'São Paulo',
            country: 'Brasil',
            countryCode: 'BR',
            latitude: -21.4647310,
            longitude: -47.0024050,
            address: { municipality: 'Mococa', state: 'São Paulo', country: 'Brasil', country_code: 'br' },
          },
        ]),
      };
    },
  });
  const { base } = await bootDbHandle(t, { citySearch });
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'City Searcher',
    email: 'city-searcher@example.com',
    password: 'correct-horse',
  });
  const res = await fetch(`${base}/api/cities?q=mococa`, {
    headers: { Cookie: cookiePair(signup), 'Accept-Language': 'pt-BR' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cities[0].label, 'Mococa, São Paulo, Brasil');
  assert.equal(body.cities[0].countryCode, 'BR');
  assert.equal(captured.url.searchParams.get('namePrefix'), 'mococa');
  assert.equal(captured.url.searchParams.get('types'), 'CITY');
  assert.match(captured.opts.headers['User-Agent'], /NODAL city search/);
});

test('static server does not expose deploy metadata or internal docs', async (t) => {
  const base = await boot(t);
  for (const path of [
    '/server/server.js',
    '/package.json',
    '/package-lock.json',
    '/vercel.json',
    '/DEPLOYMENT.md',
    '/api/index.js',
    '/supabase/migrations/20260709_production_core.sql',
    '/docs/private-plan.md',
    '/docs/nodal-member-journey/nodal-journey.html',
    '/.env.example',
  ]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, `${path} should not be public`);
  }
});

test('auth: signup creates a user session and duplicate email is rejected', async (t) => {
  const base = await bootDb(t);
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Ana Pereira',
    email: 'ana@example.com',
    password: 'correct-horse',
  });
  assert.equal(signup.status, 201);
  assert.match(signup.headers.get('set-cookie'), /nodal_session=.*HttpOnly/);
  const cookie = signup.headers.get('set-cookie').split(';')[0];
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'ana@example.com');

  const dupe = await postJson(base, '/api/auth/signup', {
    fullName: 'Ana Again',
    email: 'ana@example.com',
    password: 'correct-horse',
  });
  assert.equal(dupe.status, 409);
  assert.equal((await dupe.json()).error, 'signup could not be completed');
});

test('auth: repeated login attempts are rate limited before password work', async (t) => {
  const base = await bootDb(t);
  let last;
  for (let i = 0; i < 10; i += 1) {
    last = await postJson(base, '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong-password',
    });
    assert.equal(last.status, 401);
  }
  const limited = await postJson(base, '/api/auth/login', {
    email: 'nobody@example.com',
    password: 'wrong-password',
  });
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get('retry-after'), /^\d+$/);
});

test('auth: login, profile persistence and logout', async (t) => {
  const base = await bootDb(t);
  await postJson(base, '/api/auth/signup', {
    fullName: 'Bruno Lima',
    email: 'bruno@example.com',
    password: 'correct-horse',
  });
  const login = await postJson(base, '/api/auth/login', {
    email: 'bruno@example.com',
    password: 'correct-horse',
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const patch = await fetch(`${base}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: 'Urban Planner',
      city: 'Lima',
      topics: [{ name: 'Mobility', level: 2, validatedAt: 0, endorsedAt: 0 }],
      partC: { bio: 'Planner', linkedin: '', portfolio: '', references: '', availability: '2 h / month', consent: true },
      assessed: true,
    }),
  });
  assert.equal(patch.status, 200);
  const saved = await patch.json();
  assert.equal(saved.user.title, 'Urban Planner');
  assert.equal(saved.user.partC.availability, '2 h / month');

  const logout = await postJson(base, '/api/auth/logout', {}, { Cookie: cookie });
  assert.equal(logout.status, 200);
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 401);
});

test('privacy: member can export personal data and delete their account', async (t) => {
  const base = await bootDb(t);
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Privacy Member',
    email: 'privacy-member@example.com',
    password: 'correct-horse',
  });
  const cookie = cookiePair(signup);
  await patchJson(base, '/api/me', {
    title: 'Civic ecologist',
    city: 'Mococa, São Paulo, Brazil',
    interests: ['water'],
    active: ['pm'],
    partC: { bio: 'Works with water justice.', consent: true },
  }, { Cookie: cookie });

  const exported = await (await fetch(`${base}/api/me/export`, { headers: { Cookie: cookie } })).json();
  assert.equal(exported.data.user.email, 'privacy-member@example.com');
  assert.equal(exported.data.user.title, 'Civic ecologist');
  assert.equal(exported.data.user.city, 'Mococa, São Paulo, Brazil');
  assert.equal(exported.data.user.passwordHash, undefined);
  assert.equal(exported.data.user.password_hash, undefined);
  assert.ok(Array.isArray(exported.data.follows));
  assert.ok(Array.isArray(exported.data.interactions));

  const rejected = await fetch(`${base}/api/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ confirmEmail: 'wrong@example.com' }),
  });
  assert.equal(rejected.status, 400);

  const deleted = await fetch(`${base}/api/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ confirmEmail: 'privacy-member@example.com' }),
  });
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get('set-cookie'), /nodal_session=;/);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
});

test('profile updates cannot forge validation markers or gated mentor state', async (t) => {
  const base = await bootDb(t);
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Carla Trust',
    email: 'carla@example.com',
    password: 'correct-horse',
  });
  const cookie = cookiePair(signup);

  const patch = await patchJson(base, '/api/me', {
    topics: [{ name: 'Mobility', level: 4, validatedAt: 4, endorsedAt: 4 }],
    indicators: { leadership: 'Regularly', transmission: 'No' },
    requests: { project: true, unknown: true },
    mentorApplied: true,
    assessed: true,
  }, { Cookie: cookie });
  assert.equal(patch.status, 200);
  const user = (await patch.json()).user;
  assert.deepEqual(user.topics, [{ name: 'Mobility', level: 3, validatedAt: 0, endorsedAt: 0 }]);
  assert.equal(user.mentorApplied, false);
  assert.equal(user.requests.project, false);
  assert.equal(user.requests.unknown, undefined);
});

test('directory consent filters member listing and recommendations', async (t) => {
  const base = await bootDb(t);
  const aliceSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Alice Visible',
    email: 'alice-visible@example.com',
    password: 'correct-horse',
  });
  const aliceCookie = cookiePair(aliceSignup);
  const bobSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Bob Hidden',
    email: 'bob-hidden@example.com',
    password: 'correct-horse',
  });
  const bobCookie = cookiePair(bobSignup);

  await patchJson(base, '/api/me', {
    city: 'Lima',
    interests: ['climate'],
    partC: { linkedin: 'https://www.linkedin.com/in/alice-visible', consent: true },
  }, { Cookie: aliceCookie });
  await patchJson(base, '/api/me', {
    city: 'Lima',
    interests: ['climate'],
    partC: { linkedin: 'https://www.linkedin.com/in/bob-hidden', consent: false },
  }, { Cookie: bobCookie });

  const users = await (await fetch(`${base}/api/users`, { headers: { Cookie: aliceCookie } })).json();
  assert.ok(users.users.some((u) => u.name === 'Alice Visible'));
  assert.ok(!users.users.some((u) => u.name === 'Bob Hidden'));

  const recs = await (await fetch(`${base}/api/recommendations/me`, { headers: { Cookie: aliceCookie } })).json();
  assert.ok(!recs.recommendations.some((u) => u.name === 'Bob Hidden'));
});

test('recommendations use arbitrary roles and global city labels from real profiles', async (t) => {
  const base = await bootDb(t);
  const viewerSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Global Viewer',
    email: 'global-viewer@example.com',
    password: 'correct-horse',
  });
  const viewerCookie = cookiePair(viewerSignup);
  const peerSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Global Peer',
    email: 'global-peer@example.com',
    password: 'correct-horse',
  });
  const peerCookie = cookiePair(peerSignup);

  await patchJson(base, '/api/me', {
    title: 'Water justice organizer',
    city: 'Mococa, São Paulo, Brazil',
    interests: ['water', 'public space'],
    active: ['pm'],
    partC: { consent: true },
  }, { Cookie: viewerCookie });
  await patchJson(base, '/api/me', {
    title: 'Participatory hydrologist',
    city: 'mococa, sao paulo, brazil',
    interests: ['water', 'climate'],
    active: ['pm'],
    partC: { consent: true },
  }, { Cookie: peerCookie });

  const recs = await (await fetch(`${base}/api/recommendations/me`, { headers: { Cookie: viewerCookie } })).json();
  const peer = recs.recommendations.find((u) => u.name === 'Global Peer');
  assert.ok(peer, 'peer with arbitrary role and global city should be recommended');
  assert.equal(peer.role, 'Participatory hydrologist');
  assert.equal(peer.reasons.sameCity, true);
  assert.ok(peer.reasons.sharedInterests.includes('water'));
});

test('interactions are bounded, rate limited, and cannot poison the target deck', async (t) => {
  const { db, base } = await bootDbHandle(t);
  const victimSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Victim Member',
    email: 'victim@example.com',
    password: 'correct-horse',
  });
  const victim = (await victimSignup.clone().json()).user;
  const victimCookie = cookiePair(victimSignup);
  const attackerSignup = await postJson(base, '/api/auth/signup', {
    fullName: 'Attacker Member',
    email: 'attacker@example.com',
    password: 'correct-horse',
  });
  const attackerCookie = cookiePair(attackerSignup);

  await patchJson(base, '/api/me', {
    city: 'Lima',
    interests: ['housing'],
    active: ['am'],
    partC: { consent: true },
  }, { Cookie: victimCookie });
  await patchJson(base, '/api/me', {
    city: 'Quito',
    interests: ['marine biology'],
    active: ['eve'],
    partC: { consent: true },
  }, { Cookie: attackerCookie });

  const before = await (await fetch(`${base}/api/recommendations/me`, { headers: { Cookie: victimCookie } })).json();
  assert.deepEqual(before.recommendations, []);

  assert.equal((await postJson(base, '/api/users/me/interactions', { targetId: victim.id, type: 'message' }, { Cookie: attackerCookie })).status, 400);
  for (let i = 0; i < 60; i += 1) {
    const res = await postJson(base, '/api/users/me/interactions', { targetId: victim.id, type: 'skip' }, { Cookie: attackerCookie });
    assert.equal(res.status, 200);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM interactions').get().n, 50);

  const limited = await postJson(base, '/api/users/me/interactions', { targetId: victim.id, type: 'skip' }, { Cookie: attackerCookie });
  assert.equal(limited.status, 429);

  const after = await (await fetch(`${base}/api/recommendations/me`, { headers: { Cookie: victimCookie } })).json();
  assert.deepEqual(after.recommendations, []);
});

test('auth: private pages and user APIs require a session', async (t) => {
  const base = await bootDb(t);
  const page = await fetch(`${base}/dashboard.html`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /^\/login\.html/);
  const encoded = await fetch(`${base}/%64ashboard.html`, { redirect: 'manual' });
  assert.equal(encoded.status, 302);
  assert.match(encoded.headers.get('location'), /^\/login\.html\?next=%2Fdashboard\.html/);
  assert.equal((await fetch(`${base}/api/users`)).status, 401);
  assert.equal((await fetch(`${base}/api/recommendations/me`)).status, 401);
});

test('malformed metadata and backslash next values fail safely', async (t) => {
  const base = await bootDb(t);
  const signup = await postJson(base, '/api/auth/signup', {
    fullName: 'Dana Redirect',
    email: 'dana@example.com',
    password: 'correct-horse',
  });
  const cookie = cookiePair(signup);

  const redirect = await fetch(`${base}/login.html?next=/%5Cevil.example/phish`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/dashboard.html');

  const malformedCookie = await fetch(`${base}/api/health`, { headers: { Cookie: 'nodal_session=%E0%A4%A' } });
  assert.equal(malformedCookie.status, 200);

  const malformedHost = await rawRequest(base, { path: '/api/health', headers: { Host: '[' } });
  assert.equal(malformedHost.status, 200);
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
