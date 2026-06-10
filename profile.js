/* profile preview: connect button demo state */
(() => {
  const btn = document.getElementById('connectBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const sent = btn.classList.toggle('is-sent');
    btn.textContent = sent ? 'Request sent ✓' : 'Connect';
  });
})();
