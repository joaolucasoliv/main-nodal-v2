/* payments preview: billing cycle toggle + order summary */
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

  function setCycle(key) {
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

  // bring the summary into view so the selection is visible on mobile
  const selectPro = document.getElementById('selectPro');
  const summary = document.querySelector('.pay-summary');
  if (selectPro && summary) {
    selectPro.addEventListener('click', () => {
      summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
})();
