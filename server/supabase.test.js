import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSupabaseRepository,
  createSupabaseClients,
  publicSupabaseConfig,
  resolveSupabaseEnv,
} from './supabase.js';

test('Supabase env accepts publishable key and keeps the secret server-only', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
    SUPABASE_SECRET_KEY: 'sb_secret_server123',
  };

  assert.deepEqual(publicSupabaseConfig(env), {
    url: 'https://project.supabase.co',
    publishableKey: 'sb_publishable_public123',
  });

  const resolved = resolveSupabaseEnv(env, { requireServer: true });
  assert.equal(resolved.url, 'https://project.supabase.co');
  assert.equal(resolved.publishableKey, 'sb_publishable_public123');
  assert.equal(resolved.serverKey, 'sb_secret_server123');
  assert.equal(JSON.stringify(publicSupabaseConfig(env)).includes('sb_secret'), false);
});

test('Supabase env supports legacy anon/service_role names without browser exposure', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://legacy.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon-jwt',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-jwt',
  };

  const resolved = resolveSupabaseEnv(env, { requireServer: true });
  assert.equal(resolved.publishableKey, 'legacy-anon-jwt');
  assert.equal(resolved.serverKey, 'legacy-service-role-jwt');
  assert.deepEqual(publicSupabaseConfig(env), {
    url: 'https://legacy.supabase.co',
    publishableKey: 'legacy-anon-jwt',
  });
});

test('Supabase clients send service credentials only from the server client', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ([]),
      text: async () => '[]',
    };
  };
  const clients = createSupabaseClients({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
      SUPABASE_SECRET_KEY: 'sb_secret_server123',
    },
    fetchImpl,
  });

  await clients.browser.rest('profiles', { query: { select: 'id' } });
  await clients.admin.rest('profiles', { query: { select: 'id' } });

  assert.equal(calls[0].options.headers.apikey, 'sb_publishable_public123');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sb_publishable_public123');
  assert.equal(calls[1].options.headers.apikey, 'sb_secret_server123');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer sb_secret_server123');
});

test('Supabase env rejects secret-looking keys in public config', () => {
  assert.throws(() => publicSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrongplace',
  }), /public Supabase key must not be a secret key/);
});

test('Supabase subscription updates ignore older Stripe events', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.notEqual(options.method, 'PATCH', 'older event should not update Supabase');
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ([{
        user_id: '00000000-0000-0000-0000-000000000001',
        stripe_subscription_id: 'sub_ordered',
        subscription_status: 'active',
        stripe_latest_event_created: 200,
        updated_at: '2026-07-09T00:00:00.000Z',
      }]),
      text: async () => JSON.stringify([{
        user_id: '00000000-0000-0000-0000-000000000001',
        stripe_subscription_id: 'sub_ordered',
        subscription_status: 'active',
        stripe_latest_event_created: 200,
        updated_at: '2026-07-09T00:00:00.000Z',
      }]),
    };
  };
  const repo = createSupabaseRepository({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public123',
      SUPABASE_SECRET_KEY: 'sb_secret_server123',
    },
    fetchImpl,
  });

  const subscription = await repo.updateSubscriptionByStripeId('sub_ordered', {
    status: 'canceled',
    stripeEventCreated: 100,
  });

  assert.equal(subscription.status, 'active');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/rest/v1/stripe_customers');
});
