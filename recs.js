/* match deck: live ranked profiles for the authenticated user.
   Like → follow (server invalidates both caches); skip → recorded interaction. */
(() => {
  const stack = document.getElementById('matchStack');
  const card = stack && stack.querySelector('.match-card');
  if (!card) return;

  const els = {
    initial: card.querySelector('.leader-initial'),
    name:    card.querySelector('.match-body h3'),
    role:    card.querySelector('.match-role'),
    tags:    card.querySelector('.tags'),
    why:     card.querySelector('.match-why'),
    skip:    card.querySelector('.m-skip'),
    like:    card.querySelector('.m-like'),
  };
  if (Object.values(els).some((el) => !el)) return;

  let deck = [];
  let idx = 0;
  let live = false;
  let needsAuth = false;

  const fling = (dir, after) => {
    card.style.transform = `translateX(${dir * 120}%) rotate(${dir * 12}deg)`;
    card.style.opacity = '0';
    setTimeout(() => {
      card.style.transition = 'none';
      card.style.transform = `translateX(${-dir * 30}%)`;
      if (after) after();
      requestAnimationFrame(() => {
        card.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s ease';
        card.style.transform = 'none';
        card.style.opacity = '1';
      });
    }, 380);
  };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function show(p) {
    els.initial.textContent = p.name.charAt(0).toUpperCase();
    // the h3 holds "name" as its first text node, then the members-only lock icon
    els.name.childNodes[0].nodeValue = `${p.name} `;
    els.role.textContent = `${p.role} · ${p.city}`;
    els.tags.replaceChildren(...p.interests.slice(0, 3).map((i) => {
      const span = document.createElement('span');
      span.textContent = cap(i);
      return span;
    }));
    const shared = p.reasons.sharedInterests.slice(0, 2).map(cap).join(' · ');
    const mutuals = p.reasons.mutualConnections;
    const extras = [];
    if (p.reasons.sameCity) extras.push('same city');
    if (p.reasons.complementaryRole) extras.push('complementary role');
    els.why.textContent = `${p.matchPct}% match` +
      (shared ? ` · ${shared}` : '') +
      (mutuals ? ` · ${mutuals} mutual connection${mutuals > 1 ? 's' : ''}` : '') +
      (extras.length ? ` · ${extras.join(' · ')}` : '');
  }

  function showMessage({ title, role, tags = [], why, auth = false }) {
    live = false;
    needsAuth = auth;
    els.initial.textContent = title.charAt(0).toUpperCase();
    els.name.childNodes[0].nodeValue = `${title} `;
    els.role.textContent = role;
    els.tags.replaceChildren(...tags.map((t) => {
      const span = document.createElement('span');
      span.textContent = t;
      return span;
    }));
    els.why.textContent = why;
    els.skip.disabled = !auth;
    els.like.disabled = !auth;
  }

  async function api(path, body) {
    const res = await fetch(path, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : undefined);
    if (res.status === 401) throw Object.assign(new Error('auth required'), { code: 'auth' });
    if (!res.ok) throw new Error(`api ${res.status}`);
    return res.json();
  }

  async function load() {
    const state = await api('/api/auth/state');
    if (!state.authenticated) throw Object.assign(new Error('auth required'), { code: 'auth' });
    const data = await api('/api/recommendations/me');
    if (!Array.isArray(data.recommendations) || data.recommendations.length === 0) {
      showMessage({
        title: 'No matches yet',
        role: 'Your network will grow as more members join.',
        tags: ['Profile', 'Network', 'Soon'],
        why: 'Complete your dashboard profile and invite peers to improve matching.',
      });
      return;
    }
    deck = data.recommendations;
    idx = 0;
    live = true;
    needsAuth = false;
    els.skip.disabled = false;
    els.like.disabled = false;
    show(deck[idx]);
  }

  function advance() {
    idx += 1;
    if (idx < deck.length) show(deck[idx]);
    else load().catch(() => {});   // deck spent — caches were invalidated, re-rank
  }

  function act(kind) {
    if (needsAuth) { location.assign('/login.html?next=/dashboard.html'); return; }
    if (!live || !deck[idx]) return;
    const target = deck[idx].id;
    const req = kind === 'like'
      ? api('/api/users/me/follow', { targetId: target })
      : api('/api/users/me/interactions', { targetId: target, type: 'skip' });
    req.catch(() => {});
    advance();
  }

  els.skip.addEventListener('click', () => fling(-1, () => act('skip')));
  els.like.addEventListener('click', () => fling(1, () => act('like')));

  load().catch((err) => {
    if (err.code === 'auth') {
      showMessage({
        title: 'Sign in to match',
        role: 'Recommendations use your real profile.',
        tags: ['Account', 'Profile', 'Matches'],
        why: 'Create an account or sign in to see your ranked member deck.',
        auth: true,
      });
      return;
    }
  });
})();
