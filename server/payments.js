/* Stripe-ready checkout seam. Zero-dependency: the session is created
   against Stripe's REST API with fetch. Without STRIPE_SECRET_KEY the
   route answers 501 and the front end stays in preview mode. */

const STRIPE_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';
export const CYCLES = new Set(['monthly', 'annual']);

export function paymentsConfig(env = process.env) {
  if (!env.STRIPE_SECRET_KEY) return null;
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    prices: { monthly: env.STRIPE_PRICE_MONTHLY ?? '', annual: env.STRIPE_PRICE_ANNUAL ?? '' },
  };
}

export async function createCheckoutSession({ cycle, origin }, config, fetchImpl = fetch) {
  const price = config.prices[cycle];
  if (!price) throw Object.assign(new Error(`no price configured for ${cycle} billing`), { status: 501 });
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/payments.html?checkout=success`,
    cancel_url: `${origin}/payments.html?checkout=cancelled`,
  });
  const res = await fetchImpl(STRIPE_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw Object.assign(new Error('payment provider error'), { status: 502 });
  const session = await res.json();
  if (typeof session.url !== 'string') throw Object.assign(new Error('payment provider error'), { status: 502 });
  return { url: session.url };
}
