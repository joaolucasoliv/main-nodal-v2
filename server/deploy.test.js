import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('Vercel serves generated frontend assets before the Node serverless adapter', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const staticBuild = readFileSync(path.join(ROOT, 'server', 'build-static.js'), 'utf8');
  assert.equal(vercel.framework, null);
  assert.equal(vercel.outputDirectory, 'public');
  assert.ok(readdirSync(path.join(ROOT, vercel.outputDirectory)).length > 0);
  assert.match(packageJson.scripts.build, /server\/build-static\.js/);
  assert.match(staticBuild, /assets/);
  assert.match(staticBuild, /styles\.css/);
  assert.match(staticBuild, /dashboard\.js/);
  assert.ok(!('runtime' in vercel.functions['api/index.js']), 'Node runtime should be configured through package.json engines, not functions.runtime');
  assert.equal(typeof vercel.functions['api/index.js'].includeFiles, 'string');
  assert.ok(vercel.functions['api/index.js'].includeFiles.includes('server/**'));
  assert.ok(vercel.rewrites.some((route) => route.source === '/' && route.destination === '/api/index.js'));
  assert.ok(vercel.rewrites.some((route) => route.source === '/:path*' && route.destination === '/api/index.js'));
  assert.ok(vercel.headers.some((route) => route.source === '/assets/(.*)'));
  assert.ok(vercel.headers.some((route) => route.source.endsWith('.js')));
  assert.ok(vercel.headers.some((route) => route.source.endsWith('.css')));
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

  for (const serverOwnedPolicy of [
    'profiles_insert_own',
    'profiles_update_own',
    'profile_preferences_insert_own',
    'profile_preferences_update_own',
    'onboarding_responses_insert_own',
    'onboarding_responses_update_own',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`create policy "${serverOwnedPolicy}"`, 'i'));
  }

  assert.match(sql, /profile_preferences_directory_public_boolean/i);
  assert.match(sql, /jsonb_typeof\s*\(\s*data_consent\s*->\s*'directoryPublic'\s*\)\s*=\s*'boolean'/i);
  assert.doesNotMatch(sql, /directoryPublic'\)\s*::\s*boolean/i);
  assert.match(sql, /stripe_latest_event_rank\s+integer\s+not null\s+default\s+0/i);
  assert.match(sql, /stripe_latest_event_id\s+text\s+not null\s+default\s+''/i);
  assert.match(sql, /create or replace function public\.apply_stripe_event\b/i);
  assert.match(sql, /on conflict\s*\(user_id\)\s*do update/i);

  assert.doesNotMatch(sql, /credit_card|card_number|cvc|stripe_secret/i);
});

test('Supabase advisor hardening keeps public data invoker-scoped and server ledgers private', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const sql = readdirSync(dir)
    .sort()
    .map((name) => readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');

  assert.match(sql, /create or replace view public\.public_profiles\s+with\s*\(security_invoker\s*=\s*true\)/i);
  assert.match(sql, /alter function public\.set_updated_at\(\)\s+set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(sql, /create policy "stripe_events_deny_client"/i);
  assert.match(sql, /on public\.stripe_events\s+for all\s+to anon, authenticated\s+using \(false\)\s+with check \(false\)/i);
  assert.match(sql, /create index if not exists member_follows_target_user_id_idx\s+on public\.member_follows\s*\(target_user_id\)/i);
  for (const policy of [
    'profiles_select_own',
    'profile_preferences_select_own',
    'onboarding_responses_select_own',
    'organization_memberships_select_own',
    'organizations_select_member',
    'stripe_customers_select_own',
    'member_follows_select_participant',
    'member_interactions_select_own',
  ]) {
    assert.match(sql, new RegExp(`create policy "${policy}"[\\s\\S]*?\\(select auth\\.uid\\(\\)\\)`,'i'));
  }
});

test('CI uses immutable action revisions and supports pre-main validation refs', () => {
  const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.doesNotMatch(workflow, /uses:\s+actions\/(checkout|setup-node)@v\d+/);
  assert.match(workflow, /release-validation-\*/);
  assert.match(workflow, /npm audit --audit-level=low/);
});

test('release tree excludes internal process artifacts and unused integration placeholders', () => {
  const publicDocs = [
    readFileSync(path.join(ROOT, '.env.example'), 'utf8'),
    readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
    readFileSync(path.join(ROOT, 'DEPLOYMENT.md'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(publicDocs, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(publicDocs, /LINKEDIN_CLIENT_(ID|SECRET)/);
});
