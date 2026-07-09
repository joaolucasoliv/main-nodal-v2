/* authenticated member profile: renders the current database user.
   All writes via textContent/createElement — never innerHTML (CSP). */
(() => {
  'use strict';

  const DEFAULT_PART_C = { bio: '', linkedin: '', portfolio: '', references: '', availability: '', consent: false };
  const LEVELS = ['Exploring', 'Practicing', 'Proficient', 'Reference'];

  const $ = (id) => document.getElementById(id);
  const set = (id, text) => { const node = $(id); if (node) node.textContent = text; };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  async function api(path) {
    const res = await fetch(path);
    if (res.status === 401) {
      location.assign(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      throw new Error('authentication required');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `api ${res.status}`);
    return data;
  }

  function normalize(user) {
    return {
      ...user,
      fullName: user.fullName || user.name || 'Member',
      title: user.title || user.role || 'Member',
      city: user.city || '',
      interests: Array.isArray(user.interests) ? user.interests : [],
      topics: Array.isArray(user.topics) ? user.topics : [],
      partC: { ...DEFAULT_PART_C, ...(user.partC || {}) },
    };
  }

  function render(user) {
    document.title = `${user.fullName} · NODAL member profile`;
    set('pfName', user.fullName);
    set('pfKicker', 'Member profile · This is you');
    set('pfRole', `${user.title}${user.city ? ` · ${user.city}` : ''}`);
    const parts = user.fullName.trim().split(/\s+/);
    set('pfInitial', (parts[0]?.[0] + (parts[1]?.[0] ?? '')).toUpperCase() || 'N');
    set('pfCoord', user.city || 'Location pending');

    const tags = $('pfTags');
    const topics = user.topics.length ? user.topics : user.interests.map((name) => ({ name }));
    if (tags) {
      tags.replaceChildren(...topics.slice(0, 4).map((t) => el('span', '', t.name || String(t))));
    }

    const top = [...topics].sort((a, b) => (b.level || 0) - (a.level || 0))[0];
    set('pfMeta', top?.level
      ? `Strongest topic: ${top.name} · ${LEVELS[top.level - 1]} · ${user.assessed ? 'self-assessment done' : 'self-assessment pending'}`
      : 'Profile created · self-assessment pending');

    const li = $('pfLinkedin');
    const liUrl = (user.partC.linkedin || user.linkedin || '').trim();
    const LI_OK = /^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]+/;
    if (li) {
      if (liUrl && LI_OK.test(liUrl)) {
        li.hidden = false;
        li.href = liUrl;
        set('pfLinkedinText', liUrl.replace(/^https:\/\/(www\.)?/, ''));
      } else {
        li.hidden = true;
      }
    }

    const match = $('pfMatch');
    if (match) {
      match.replaceChildren('Your community card');
      match.append(el('small', '', user.partC.consent ? 'visible in the member directory' : 'hidden until you opt in'));
    }
    const btns = $('pfBtns');
    if (btns) {
      btns.replaceChildren();
      const edit = el('a', 'btn btn-primary', 'Edit profile');
      edit.href = 'dashboard.html';
      const share = el('button', 'btn btn-ghost', 'Copy profile link');
      share.type = 'button';
      share.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          share.textContent = 'Link copied';
        } catch {
          share.textContent = location.href;
        }
        setTimeout(() => { share.textContent = 'Copy profile link'; }, 2200);
      });
      btns.append(edit, share);
    }

    set('pfAbout', user.partC.bio || 'No bio yet. Add one from your dashboard so the community can understand what you care about.');
    const quote = $('pfQuote');
    if (quote) quote.hidden = true;

    const projects = $('pfProjects');
    if (projects) {
      const item = el('li');
      const head = el('div', 'pf-proj-head');
      head.append(el('h3', '', 'No projects yet'), el('span', 'pf-status', 'Open'));
      item.append(head, el('p', '', 'Projects appear here as you join collaborations through the NODAL network.'));
      projects.replaceChildren(item);
    }

    const locked = document.querySelector('.pf-locked');
    if (locked) {
      const fresh = el('article', 'pf-card');
      const num = el('span', 'pf-num', 'P.03');
      num.setAttribute('aria-hidden', 'true');
      fresh.append(num, el('h2', '', 'Community signals'));
      [
        ['Availability', user.partC.availability || 'Not declared yet'],
        ['References', user.partC.references ? 'On file' : 'Not added yet'],
        ['Portfolio', user.partC.portfolio || 'Not added yet'],
        ['LinkedIn', liUrl ? 'Linked' : 'Not added yet'],
        ['Directory consent', user.partC.consent ? 'Visible in the member directory' : 'Hidden from the directory'],
      ].forEach(([k, v]) => {
        const p = el('p');
        p.append(el('strong', '', `${k}: `), v);
        fresh.append(p);
      });
      fresh.append(el('p', 'pf-quote', 'These signals help the community connect with care. Members see them; visitors do not.'));
      locked.replaceWith(fresh);
    }

    set('pfActConn', '0');
    set('pfActProj', '0');
    set('pfActCourses', '0');
    set('pfActSince', new Date(user.createdAt || Date.now()).getFullYear());

    const list = $('pfConnList');
    if (list) {
      const empty = el('li');
          empty.append(el('span', '', 'No connections yet. Start by joining conversations and meeting people with shared interests.'));
      list.replaceChildren(empty);
      api('/api/users').then((data) => {
        const people = (data.users || []).filter((u) => u.id !== user.id).slice(0, 4);
        if (!people.length) return;
        const head = el('li');
        head.append(el('span', '', 'On the network now:'));
        list.replaceChildren(head, ...people.map((u) => {
          const row = el('li');
          row.append(el('span', '', `${u.name} · ${u.role}`));
          return row;
        }));
      }).catch(() => {});
    }
  }

  api('/api/auth/me').then((data) => render(normalize(data.user))).catch(() => {});
})();
