/* payments: billing cycle toggle + order summary + provider seam.
   Providers are tried in order; 'stripe' activates only when the server
   has STRIPE_SECRET_KEY configured, otherwise 'preview' keeps today's
   behavior — including on plain static hosting where fetch fails. */
(() => {
  const PRICING = {
    monthly: { label: 'Monthly', amount: 'US$10',  per: '/ month',
               note: 'Cancel anytime.',
               renews: 'Every month, until you cancel' },
    annual:  { label: 'Annual',  amount: 'US$100', per: '/ year',
               note: 'Equivalent to US$8.33 / month.',
               renews: 'Every 12 months, until you cancel' },
  };

  const els = {
    monthly: document.getElementById('cycleMonthly'),
    annual:  document.getElementById('cycleAnnual'),
    amount:  document.getElementById('proPrice'),
    per:     document.getElementById('proPer'),
    note:    document.getElementById('proNote'),
    cycle:   document.getElementById('sumCycle'),
    price:   document.getElementById('sumPrice'),
    renews:  document.getElementById('sumRenews'),
  };
  // bail out cleanly if the page structure changes — never throw on load
  if (Object.values(els).some((el) => !el)) return;

  let currentCycle = 'monthly';

  function setCycle(key) {
    currentCycle = key;
    const p = PRICING[key];
    els.amount.textContent = p.amount;
    els.per.textContent = p.per;
    els.note.textContent = p.note;
    els.cycle.textContent = p.label;
    els.price.textContent = `${p.amount} ${p.per}`;
    els.renews.textContent = p.renews;

    const on = key === 'monthly';
    els.monthly.classList.toggle('is-on', on);
    els.annual.classList.toggle('is-on', !on);
    els.monthly.setAttribute('aria-pressed', String(on));
    els.annual.setAttribute('aria-pressed', String(!on));
  }

  els.monthly.addEventListener('click', () => setCycle('monthly'));
  els.annual.addEventListener('click', () => setCycle('annual'));

  /* payment providers, tried in order; 'preview' always succeeds */
  const PROVIDERS = [
    {
      id: 'stripe',
      async checkout({ plan, cycle }) {
        let res;
        try {
          res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, cycle }),
            signal: AbortSignal.timeout(8000),   // a hung request must not strand the button
          });
        } catch { return { status: 'unavailable' }; }       // static hosting / timeout
        if (!res.ok) return { status: 'unavailable' };       // 501 = not configured
        const data = await res.json().catch(() => null);
        if (!data || typeof data.url !== 'string') return { status: 'unavailable' };
        let host;
        try { host = new URL(data.url).hostname; } catch { return { status: 'unavailable' }; }
        if (host !== 'checkout.stripe.com') return { status: 'unavailable' };
        return { status: 'redirect', url: data.url };
      },
    },
    { id: 'preview', async checkout() { return { status: 'preview' }; } },
  ];

  const selectPro = document.getElementById('selectPro');
  const summary = document.querySelector('.pay-summary');
  const payNote = document.getElementById('payPreviewNote');

  // returning from a hosted checkout (?checkout=success|cancelled)
  const backFrom = new URLSearchParams(location.search).get('checkout');
  if (payNote && (backFrom === 'success' || backFrom === 'cancelled')) {
    payNote.textContent = backFrom === 'success'
      ? 'Payment confirmed — welcome aboard. Your receipt is on its way by email.'
      : 'Checkout cancelled — nothing was charged.';
    payNote.hidden = false;
  }

  async function startCheckout() {
    selectPro.disabled = true;
    for (const provider of PROVIDERS) {
      const result = await provider.checkout({ plan: 'membership', cycle: currentCycle });
      if (result.status === 'redirect') { location.assign(result.url); return; }
      if (result.status === 'preview') break;
    }
    selectPro.disabled = false;
    if (payNote) payNote.hidden = false;
    summary?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  selectPro?.addEventListener('click', () => { startCheckout(); });
})();
