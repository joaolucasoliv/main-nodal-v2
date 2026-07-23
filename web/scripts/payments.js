/* payments: billing cycle toggle + order summary + provider seam.
   Stripe checkout is created server-side. The local fallback only appears
   when the current environment is intentionally not configured for payments. */
(() => {
  let pricing = {
    monthly: {
      label: 'Monthly',
      amount: 'Soon',
      per: '',
      note: 'Cancel anytime.',
      renews: 'Every month, until you cancel',
      badge: '',
    },
    annual: {
      label: 'Annual',
      amount: 'Soon',
      per: '',
      note: '',
      renews: 'Every 12 months, until you cancel',
      badge: '',
    },
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
    annualBadge: document.getElementById('cycleAnnualBadge'),
  };
  // bail out cleanly if the page structure changes — never throw on load
  if (Object.values(els).some((el) => !el)) return;

  let currentCycle = 'monthly';

  function setCycle(key) {
    currentCycle = key;
    const p = pricing[key];
    els.amount.textContent = p.amount;
    els.per.textContent = p.per;
    els.note.textContent = p.note;
    els.cycle.textContent = p.label;
    els.price.textContent = [p.amount, p.per].filter(Boolean).join(' ');
    els.renews.textContent = p.renews;

    const on = key === 'monthly';
    els.monthly.classList.toggle('is-on', on);
    els.annual.classList.toggle('is-on', !on);
    els.monthly.setAttribute('aria-pressed', String(on));
    els.annual.setAttribute('aria-pressed', String(!on));
    if (els.annualBadge) {
      els.annualBadge.textContent = pricing.annual.badge || '';
      els.annualBadge.hidden = !pricing.annual.badge;
    }
  }

  function cleanCycle(raw, fallback) {
    const value = raw && typeof raw === 'object' ? raw : {};
    return {
      label: String(value.label || fallback.label),
      amount: String(value.amount || fallback.amount),
      per: String(value.per || fallback.per),
      note: String(value.note || fallback.note),
      renews: String(value.renews || fallback.renews),
      badge: String(value.badge || fallback.badge),
    };
  }

  async function loadBillingConfig() {
    try {
      const res = await fetch('/api/billing/config', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      pricing = {
        monthly: cleanCycle(data.cycles?.monthly, pricing.monthly),
        annual: cleanCycle(data.cycles?.annual, pricing.annual),
      };
      setCycle(currentCycle);
    } catch {
      // Static hosting or offline demos keep the neutral "configured at checkout" copy.
    }
  }

  els.monthly.addEventListener('click', () => setCycle('monthly'));
  els.annual.addEventListener('click', () => setCycle('annual'));
  setCycle(currentCycle);
  loadBillingConfig();

  /* payment providers, tried in order; the fallback only reports local misconfiguration */
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
        if (res.status === 401) return { status: 'auth' };
        if (!res.ok) return { status: 'unavailable' };       // 501 = not configured
        const data = await res.json().catch(() => null);
        if (!data || typeof data.url !== 'string') return { status: 'unavailable' };
        let host;
        try { host = new URL(data.url).hostname; } catch { return { status: 'unavailable' }; }
        if (host !== 'checkout.stripe.com') return { status: 'unavailable' };
        return { status: 'redirect', url: data.url };
      },
    },
    { id: 'local-fallback', async checkout() { return { status: 'local-fallback' }; } },
  ];

  const selectPro = document.getElementById('selectPro');
  const summaryCheckout = document.getElementById('summaryCheckout');
  const summary = document.querySelector('.pay-summary');
  const payNote = document.getElementById('payCheckoutNote');

  const setNote = (message) => {
    if (!payNote) return;
    payNote.textContent = message;
    payNote.hidden = false;
  };

  const setBusy = (busy) => {
    if (selectPro) selectPro.disabled = busy;
    if (summaryCheckout) summaryCheckout.disabled = busy;
  };

  async function refreshBillingStatus() {
    try {
      const res = await fetch('/api/billing/status', { headers: { Accept: 'application/json' } });
      if (res.status === 401) {
        location.assign(`/login.html?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (!res.ok) throw new Error('status unavailable');
      const data = await res.json();
      if (data.subscription?.active) {
        setNote('Support confirmed by the payment provider. Thank you for sustaining NODAL.');
      } else if (data.subscription?.status && data.subscription.status !== 'none') {
        setNote(`Checkout returned. Provider confirmation is still ${data.subscription.status}.`);
      } else {
        setNote('Checkout returned. Provider confirmation can take a moment; refresh this page if the status does not update.');
      }
    } catch {
      setNote('Checkout returned. We could not verify the payment provider status yet.');
    }
  }

  // returning from a hosted checkout (?checkout=success|cancelled)
  const backFrom = new URLSearchParams(location.search).get('checkout');
  if (payNote && (backFrom === 'success' || backFrom === 'cancelled')) {
    if (backFrom === 'success') refreshBillingStatus();
    else setNote('Checkout cancelled — nothing was charged.');
  }

  async function startCheckout() {
    setBusy(true);
    for (const provider of PROVIDERS) {
      const result = await provider.checkout({ plan: 'membership', cycle: currentCycle });
      if (result.status === 'auth') {
        location.assign(`/login.html?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (result.status === 'redirect') { location.assign(result.url); return; }
      if (result.status === 'local-fallback') break;
    }
    setBusy(false);
    setNote('Live checkout is not configured in this environment.');
    summary?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  selectPro?.addEventListener('click', () => { startCheckout(); });
  summaryCheckout?.addEventListener('click', () => { startCheckout(); });
})();
