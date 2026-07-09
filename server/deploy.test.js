import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('Vercel routes all requests through the Node serverless adapter', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.framework, null);
  assert.ok(!('runtime' in vercel.functions['api/index.js']), 'Node runtime should be configured through package.json engines, not functions.runtime');
  assert.equal(typeof vercel.functions['api/index.js'].includeFiles, 'string');
  assert.ok(vercel.functions['api/index.js'].includeFiles.includes('server/**'));
  assert.ok(vercel.rewrites.some((route) => route.source === '/:path*' && route.destination === '/api/index.js'));
});

test('Supabase migration creates required tables with RLS policies and indexes', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const migrationName = readdirSync(dir).find((name) => name.endsWith('_production_core.sql'));
  assert.ok(migrationName, 'expected production Supabase migration');
  const sql = readFileSync(path.join(dir, migrationName), 'utf8');

  for (const table of [
    'profiles',
    'profile_preferences',
    'onboarding_responses',
    'organizations',
    'organization_memberships',
    'stripe_customers',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'));
  }

  for (const policy of [
    'profiles_select_own',
    'profiles_update_own',
    'profile_preferences_select_own',
    'onboarding_responses_select_own',
    'stripe_customers_select_own',
  ]) {
    assert.match(sql, new RegExp(`create policy "${policy}"`, 'i'));
  }

  for (const index of [
    'profile_preferences_user_id_idx',
    'onboarding_responses_user_id_idx',
    'organization_memberships_organization_id_idx',
    'organization_memberships_user_id_idx',
    'stripe_customers_user_id_idx',
    'stripe_customers_stripe_customer_id_idx',
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}`, 'i'));
  }

  assert.doesNotMatch(sql, /credit_card|card_number|cvc|stripe_secret/i);
});
