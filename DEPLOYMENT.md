# NODAL Deployment Checklist

## Supabase Setup

1. Create a Supabase project.
2. Open Project Settings -> API Keys.
3. Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`.
4. Prefer the new `sb_publishable_...` key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Prefer the new Supabase secret key for `SUPABASE_SECRET_KEY`.
6. Legacy projects may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
7. Never put `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in browser code.

## SQL Migration Steps

Apply this migration in Supabase SQL Editor or through the Supabase CLI:

```sh
supabase db push
```

Migration file:

```text
supabase/migrations/20260709_production_core.sql
```

Confirm after applying:

- RLS is enabled on every app table.
- `public.public_profiles` exposes only intentional directory-safe profile fields.
- No card data, Stripe secrets, passwords, or raw payment details are stored.
- `profile_preferences`, `onboarding_responses`, and `stripe_customers` have `user_id` indexes.

## Vercel Environment Variables

Set these in Vercel Project Settings:

```text
NODE_ENV=production
DATA_BACKEND=supabase
NEXT_PUBLIC_APP_URL=https://your-domain.example
PUBLIC_BASE_URL=https://your-domain.example
COOKIE_SECURE=true
TRUST_PROXY=true
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
PAYMENTS_MODE=preview
SUBSCRIPTION_PRICE_MONTHLY_LABEL=US$10
SUBSCRIPTION_PRICE_ANNUAL_LABEL=US$100
```

Add these when Stripe goes live:

```text
PAYMENTS_MODE=live
STRIPE_SECRET_KEY=<server-only Stripe live secret key>
STRIPE_WEBHOOK_SECRET=<server-only Stripe webhook signing secret>
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Add these when LinkedIn OAuth is configured in Supabase:

```text
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
```

## Auth Redirect URL Setup

In Supabase Auth URL configuration:

- Site URL: `https://your-domain.example`
- Redirect URLs:
  - `https://your-domain.example/login.html`
  - `https://your-domain.example/dashboard.html`
  - `https://your-domain.example/profile.html`

If email confirmations are enabled, keep the Supabase confirmation template pointed at the production domain.

## Local Development Setup

SQLite fallback:

```sh
npm install
DATA_BACKEND=sqlite npm run migrate
DATA_BACKEND=sqlite npm start
```

Supabase-backed local run:

```sh
DATA_BACKEND=supabase \
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
SUPABASE_SECRET_KEY=<server-only Supabase secret key> \
PUBLIC_BASE_URL=http://127.0.0.1:4173 \
npm start
```

## Production Deployment Steps

1. Confirm `.env`, `.env.local`, `.env.production`, `.vercel/`, and `data/` are not committed.
2. Apply the Supabase migration.
3. Configure Vercel environment variables.
4. Connect the Git repository to Vercel.
5. Keep Framework Preset as Other or use the committed `vercel.json`.
6. Deploy.
7. Visit `/api/health`.
8. Create a test account.
9. Confirm `/dashboard.html` redirects unauthenticated users to `/login.html`.
10. Confirm profile edits persist after refresh.
11. Confirm Stripe checkout returns `payments not configured` while `PAYMENTS_MODE=preview`.

## Security Checklist

- No real secrets in Git.
- Supabase secret/service-role key exists only in Vercel server env.
- RLS remains enabled on all Supabase tables.
- Public directory data is served only from intentional fields.
- Auth cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Stripe webhook signature verification is configured before live billing.
- LinkedIn client secret is never exposed to browser code.
- Production logs do not include passwords, access tokens, service keys, or raw profile payloads.

## Manual External Configuration Still Required

- Supabase project creation and SQL migration execution.
- Supabase Auth email settings and LinkedIn provider setup.
- Stripe products, prices, Checkout configuration, and webhook endpoint.
- Vercel project env vars, production domain, TLS, and deployment protection.
- Optional Redis cache with `rediss://` if remote caching is needed.
