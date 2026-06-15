/* public profile: renders the active dashboard member (shared localStorage
   state) with real tools — edit link, copy-profile-link, live match signals.
   With no saved member the page stays the authored Flavia demo.
   All writes via textContent/createElement — never innerHTML (CSP). */
(() => {
  'use strict';
  const KEY = 'nodal.dashboard.v2';
  const COORDS = {
    Lima: '12.04°S · 77.04°W', 'Bogotá': '4.71°N · 74.07°W', CDMX: '19.43°N · 99.13°W',
    'São Paulo': '23.55°S · 46.63°W', Santiago: '33.45°S · 70.66°W', 'Medellín': '6.24°N · 75.58°W',
    Montevideo: '34.90°S · 56.16°W', Quito: '0.18°S · 78.47°W', 'Buenos Aires': '34.60°S · 58.38°W',
    Curitiba: '25.43°S · 49.27°W',
  };
  const LEVELS = ['Exploring', 'Practicing', 'Proficient', 'Reference'];

  // demo connect button (only present until a member takes over the page)
  const connectBtn = document.getElementById('connectBtn');
  connectBtn?.addEventListener('click', () => {
    const sent = connectBtn.classList.toggle('is-sent');
    connectBtn.textContent = sent ? 'Request sent ✓' : 'Connect';
  });

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(KEY) || '{}').user ?? null;
  } catch { user = null; }
  if (!user || !user.name) return;   // no member yet — Flavia demo as authored

  const $ = (id) => document.getElementById(id);
  const set = (id, text) => { const node = $(id); if (node) node.textContent = text; };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const isDemo = user.kind === 'demo';

  /* ---------- identity plate ---------- */
  document.title = `${user.name} · NODAL member profile`;
  set('pfName', user.name);
  set('pfKicker', isDemo ? 'Member profile · Camila (demo)' : 'Member profile · This is you');
  set('pfRole', `${user.role} · ${user.city}`);
  const parts = user.name.trim().split(/\s+/);
  set('pfInitial', (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase());
  set('pfCoord', `${COORDS[user.city] ?? ''} · ${user.city}`.replace(/^ · /, ''));

  const tags = $('pfTags');
  if (tags && Array.isArray(user.topics)) {
    tags.replaceChildren(...user.topics.slice(0, 4).map((t) => el('span', '', t.name)));
  }

  const top = [...(user.topics ?? [])].sort((a, b) => b.level - a.level)[0];
  set('pfMeta', top
    ? `Strongest topic: ${top.name} · ${LEVELS[top.level - 1]} · ${user.assessed ? 'self-assessment done' : 'self-assessment pending'}`
    : 'Profile just created · self-assessment pending');

  const li = $('pfLinkedin');
  const liUrl = (user.partC?.linkedin ?? '').trim();
  // re-validate on read: storage is user-editable, the href must stay a real LinkedIn URL
  const LI_OK = /^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]+/;
  if (li) {
    if (liUrl && LI_OK.test(liUrl)) {
      li.href = liUrl;
      set('pfLinkedinText', liUrl.replace(/^https:\/\/(www\.)?/, ''));
    } else {
      li.hidden = true;
    }
  }

  /* ---------- own-profile tools (real, not decorative) ---------- */
  const match = $('pfMatch');
  if (match) {
    match.replaceChildren('Your public card');
    match.append(el('small', '', 'this is how members see you'));
  }
  const btns = $('pfBtns');
  if (btns) {
    btns.replaceChildren();
    const edit = el('a', 'btn btn-primary', 'Edit on dashboard');
    edit.href = 'dashboard.html';
    const share = el('button', 'btn btn-ghost', 'Copy profile link');
    share.type = 'button';
    share.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        share.textContent = 'Link copied ✓';
      } catch {
        share.textContent = location.href;   // clipboard blocked — show the link itself
      }
      setTimeout(() => { share.textContent = 'Copy profile link'; }, 2200);
    });
    btns.append(edit, share);
  }

  /* ---------- about ---------- */
  const bio = (user.partC?.bio ?? '').trim();
  set('pfAbout', bio || 'No bio yet. Add one from your dashboard — Part C takes two minutes.');
  const quote = $('pfQuote');
  if (quote) quote.hidden = true;   // the authored pull-quote belongs to the Flavia demo

  /* ---------- projects ---------- */
  const projects = $('pfProjects');
  if (projects) {
    const item = (title, status, body) => {
      const row = el('li');
      const head = el('div', 'pf-proj-head');
      head.append(el('h3', '', title), el('span', 'pf-status', status));
      row.append(head, el('p', '', body));
      return row;
    };
    projects.replaceChildren(...(isDemo
      ? [
        item('Plaza co-design pilot · Lima', 'Active', '6 neighbourhood sessions; the final layout was adopted by the municipality.'),
        item('Corridor survey kit', 'Shared 2025', 'Open resource with 12 downloads — counts toward the Knowledge Sharer badge.'),
      ]
      : [
        item('No projects yet', 'Open', 'Projects appear here as you join collaborations. Start from the match deck on the home page.'),
      ]));
  }

  /* ---------- match signals: the member's own Part C, live ---------- */
  const locked = document.querySelector('.pf-locked');
  if (locked) {
    const fresh = el('article', 'pf-card');
    const num = el('span', 'pf-num', 'P.03');
    num.setAttribute('aria-hidden', 'true');
    fresh.append(num, el('h2', '', 'Match signals'));
    const pc = user.partC ?? {};
    [
      ['Availability', pc.availability || 'Not declared yet'],
      ['References', pc.references ? 'On file' : 'Not added yet'],
      ['Portfolio', pc.portfolio || 'Not added yet'],
      ['LinkedIn', liUrl ? 'Linked' : 'Not added yet'],
      ['Directory consent', pc.consent ? 'Visible in the member directory' : 'Hidden from the directory'],
    ].forEach(([k, v]) => {
      const p = el('p');
      p.append(el('strong', '', `${k}: `), v);
      fresh.append(p);
    });
    fresh.append(el('p', 'pf-quote', 'These signals feed your matches. Members see them; visitors don’t.'));
    locked.replaceWith(fresh);
  }

  /* ---------- activity + connections (real state for fresh members) ---------- */
  if (!isDemo) {
    set('pfActConn', '0');
    set('pfActProj', '0');
    set('pfActCourses', '0');
    set('pfActSince', String(new Date().getFullYear()));
    const list = $('pfConnList');
    if (list) {
      const empty = el('li');
      empty.append(el('span', '', 'No connections yet — like profiles on the match deck to start.'));
      list.replaceChildren(empty);
      // when the API is up, show who's on the network right now
      fetch('/api/users').then((r) => (r.ok ? r.json() : null)).then((data) => {
        if (!data || !Array.isArray(data.users)) return;
        const people = data.users.filter((u) => u && u.id !== 'you').slice(0, 4);
        if (!people.length) return;
        const head = el('li');
        head.append(el('span', '', 'On the network now:'));
        list.replaceChildren(head, ...people.map((u) => {
          const row = el('li');
          row.append(el('span', '', `${u.name} · ${u.role}`));
          return row;
        }));
      }).catch(() => { /* static hosting */ });
    }
  }
})();
