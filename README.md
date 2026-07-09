# NODAL

NODAL is a deployable web app for authenticated member profiles, a private dashboard, persisted recommendations, and a Stripe-ready supporting membership flow.

The app intentionally keeps the existing lightweight stack:

- Static HTML/CSS/JS frontend.
- Node HTTP server in `server/server.js`.
- Vercel serverless adapter in `api/index.js`.
- Supabase Auth/Postgres for production on Vercel.
- SQLite fallback for local development and automated tests.
- No production mock users are loaded automatically.
- Stripe checkout and webhooks are server-side and fail closed when credentials are absent or incomplete.

## Requirements

- Node.js 22 or newer.
- Supabase project for production deploys.
- Vercel project configured with the environment variables from `.env.example`.

## Install

```sh
npm install
```

## Environment

Copy `.env.example` for local experiments, but put real production values in Vercel Project Settings:

```sh
cp .env.example .env
```

Production on Vercel should use:

- `DATA_BACKEND=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` and/or `PUBLIC_BASE_URL`
- Stripe and LinkedIn placeholders from `.env.example` when those integrations are configured

Local-only SQLite fallback:

```sh
DATA_BACKEND=sqlite DATABASE_PATH=./data/nodal.sqlite npm run migrate
DATA_BACKEND=sqlite npm start
```

## Database

Production schema lives in:

```sh
supabase/migrations/20260709_production_core.sql
```

Apply it in Supabase SQL Editor or with the Supabase CLI. The migration creates profile, preferences, onboarding, organization, membership, Stripe customer, follows, interactions, and Stripe event tables with RLS enabled.

## Run Locally

For local SQLite fallback:

```sh
npm run migrate
npm start
```

Then open `http://127.0.0.1:4173/`.

Core flows:

- Create account: `login.html`
- Dashboard: `dashboard.html`
- Profile: `profile.html`
- Logout: dashboard sidebar
- Export personal data or delete account: dashboard profile dialog

## Production

Vercel routes all requests through `api/index.js`, which forwards to the existing Node app. This preserves protected-route redirects, API auth checks, security headers, and static-file blocking.

Build gate:

```sh
npm run build
```

## Tests

```sh
npm test
```

The tests cover recommendation behavior, auth/session flow, profile persistence, privacy export/deletion, private-route protection, Stripe checkout/webhooks, runtime config validation, Vercel routing config, and Supabase migration safety checks.

## Stripe

The browser never receives `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`. `/api/checkout` creates Checkout Sessions server-side, and `/api/stripe/webhook` accepts subscription state only after Stripe signature verification. Do not store card data in Supabase; the schema stores only Stripe IDs and subscription metadata.

## LinkedIn

LinkedIn OAuth is prepared through environment placeholders. Configure the provider in Supabase Auth, using `LINKEDIN_CLIENT_ID` and server-only `LINKEDIN_CLIENT_SECRET`; do not hardcode either value in frontend files.
