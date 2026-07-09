/* member dashboard with a real user layer.
   The authenticated API user drives every card: identity, role stack, trust
   ladder, growth branches, badges, completeness, timeline. State persists in
   the server database. All DOM is createElement/textContent · no HTML injection. */
(() => {
  'use strict';

  /* ================= persisted state ================= */
  const DEFAULT_PART_C = { bio: '', linkedin: '', portfolio: '', references: '', availability: '', consent: false };
  const DEFAULT_INDICATORS = { leadership: 'No', transmission: 'No' };
  const state = { user: null, notifRead: false };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (res.status === 401) {
      location.assign(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      throw new Error('authentication required');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `api ${res.status}`);
    return data;
  }

  function normalizeApiUser(user) {
    const partC = { ...DEFAULT_PART_C, ...(user.partC || {}) };
    return {
      kind: 'member',
      id: user.id,
      name: user.fullName || user.name || '',
      role: user.title || user.role || 'Member',
      city: user.city || '',
      active: Array.isArray(user.active) ? user.active : [],
      assessed: Boolean(user.assessed),
      topics: Array.isArray(user.topics) ? user.topics : [],
      skills: Array.isArray(user.skills) ? user.skills : [],
      indicators: { ...DEFAULT_INDICATORS, ...(user.indicators || {}) },
      partC,
      requests: user.requests && typeof user.requests === 'object' ? user.requests : {},
      mentorApplied: Boolean(user.mentorApplied),
      notifRead: Boolean(user.notifRead),
    };
  }

  function serializeUser(user) {
    return {
      fullName: user.name,
      title: user.role,
      city: user.city,
      interests: user.topics.map((t) => String(t.name || t).toLowerCase()).filter(Boolean),
      active: user.active,
      topics: user.topics,
      skills: user.skills,
      indicators: user.indicators,
      partC: user.partC,
      requests: user.requests,
      mentorApplied: user.mentorApplied,
      assessed: user.assessed,
      notifRead: state.notifRead,
    };
  }

  /* ================= model ================= */
  const LEVELS = ['Exploring', 'Practicing', 'Proficient', 'Reference'];
  const TAXONOMY = ['Mobility', 'Public space', 'Housing', 'Climate & resilience', 'Care & gender',
    'Governance & participation', 'Safety', 'Informality', 'Heritage', 'Urban data & tech',
    'Land use & planning', 'Environment & nature'];
  const blankPartC = () => ({ bio: '', linkedin: '', portfolio: '', references: '', availability: '', consent: false });
  const makeTopic = (name, level = 1) => ({ name, level, validatedAt: 0, endorsedAt: 0 });
  const cleanCity = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const cleanRole = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);

  function newUser(name, city, role, topicNames) {
    return {
      kind: 'member',
      name, role, city,
      assessed: false,
      topics: topicNames.map((n) => makeTopic(n)),
      skills: [],
      indicators: { leadership: 'No', transmission: 'No' },
      partC: blankPartC(),
      requests: {}, mentorApplied: false,
    };
  }

  let U = null;
  const maxLevel = () => Math.max(0, ...U.topics.map((t) => t.level));

  function setUser(user, persist = true) {
    U = user;
    if (persist) { state.user = user; touchUser(); }
    applyAll();
  }
  async function saveProfile() {
    if (!U) return;
    const data = await api('/api/me', { method: 'PATCH', body: JSON.stringify(serializeUser(U)) });
    U = normalizeApiUser(data.user);
    state.user = U;
    state.notifRead = U.notifRead;
  }
  function touchUser() {
    if (state.user) state.user = U;
    saveProfile().catch(() => {});
  }

  const stageOf = (t) => (t.validatedAt >= t.level ? 'validated' : t.endorsedAt >= t.level ? 'endorsed' : 'self');
  const stageLabel = { validated: 'NODAL-validated', endorsed: 'peer-endorsed', self: 'self-declared' };

  /* ================= greeting + identity ================= */
  function renderIdentity() {
    const greetWord = document.getElementById('greetWord');
    if (greetWord) {
      const h = new Date().getHours();
      greetWord.textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    }
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = U.name;
    const avatar = document.getElementById('userBtn');
    if (avatar) {
      const parts = U.name.trim().split(/\s+/);
      avatar.textContent = (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
    }
    const place = document.getElementById('userPlace');
    if (place) place.textContent = U.city || 'Complete your city';
    const sub = document.getElementById('greetSub');
    if (sub) {
      sub.textContent = U.assessed
        ? 'Your profile is live and your self-assessment is in. Your suggested path and open community routes are below.'
        : 'Your profile is live. Four minutes of self-assessment helps the community understand what you care about and where you want to grow.';
    }
    const liChip = document.getElementById('userLinkedIn');
    const liText = document.getElementById('userLinkedInText');
    if (liChip && liText) {
      const url = U.partC?.linkedin ?? '';
      liChip.hidden = url === '';
      if (url) {
        liChip.href = url;
        const m = url.match(/linkedin\.com\/((?:in|company)\/[A-Za-z0-9_-]+)/);
        liText.textContent = m ? m[1] : 'LinkedIn';
      }
    }
  }

  /* ================= role stack ================= */
  function userRoles() {
    const roles = [{ label: 'Community Member', scope: 'since today', cls: 'r-validated' }];
    roles.push({ label: 'Active Contributor', scope: 'next · 3 actions in 90 days', cls: 'r-path' });
    if (U.assessed && maxLevel() >= 3 && U.indicators.transmission !== 'No') {
      roles.push({ label: 'Mentor', scope: 'fast-track open', cls: 'r-path' });
    } else if (U.assessed && maxLevel() >= 2) {
      const top = U.topics.find((t) => t.level === maxLevel());
      roles.push({ label: 'Skilled Practitioner', scope: `path open · ${top.name}`, cls: 'r-path' });
    }
    return roles;
  }

  function renderRoles() {
    const list = document.getElementById('roleList');
    if (!list) return;
    list.replaceChildren(...userRoles().map((r) => {
      const li = document.createElement('li');
      const pill = document.createElement('span');
      pill.className = `role-pill ${r.cls}`;
      pill.textContent = r.label;
      const scope = document.createElement('span');
      scope.className = 'role-scope';
      scope.textContent = r.scope;
      li.append(pill, scope);
      return li;
    }));
    const mix = document.getElementById('roleMix');
    const legend = document.getElementById('roleMixLegend');
    if (mix && legend) {
      mix.style.display = 'none';
      legend.textContent = 'Your activity mix appears here once you start participating.';
    }
  }

  /* ================= mentoring card ================= */
  function renderMentorCard() {
    const hours = document.getElementById('mentorHours');
    const mentees = document.getElementById('mentorMentees');
    const note = document.getElementById('mentorNote');
    const cta = document.getElementById('mentorCta');
    if (!hours || !mentees || !note || !cta) return;
    const em = document.createElement('em');
    em.textContent = 'h';
    hours.replaceChildren('00:00', em);
    mentees.textContent = '0';
    const qualifies = U.assessed && maxLevel() >= 3 && U.indicators.transmission !== 'No';
    note.textContent = qualifies
      ? 'You may be ready to mentor. Validation starts with a light review and a conversation.'
      : 'Not mentoring yet. Every member can learn from others and, in time, support someone else.';
    cta.textContent = U.assessed ? 'Review your assessment' : 'Start the self-assessment';
    cta.setAttribute('href', '#assessment');
  }

  /* ================= trust ladder ================= */
  function renderTrust() {
    const list = document.getElementById('trustList');
    if (!list) return;
    const groups = [['Topics · what', U.topics]];
    if (U.skills.length) groups.push(['Skills · how', U.skills]);
    const items = [];
    groups.forEach(([title, entries]) => {
      const cap = document.createElement('li');
      const span = document.createElement('span');
      span.className = 't-group';
      span.textContent = title;
      cap.appendChild(span);
      items.push(cap);
      entries.forEach((t) => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.className = 't-name';
        name.textContent = t.name;
        const stage = stageOf(t);
        const dots = document.createElement('span');
        dots.className = 't-dots';
        dots.setAttribute('aria-label', `Level ${t.level} of 4, ${stageLabel[stage]}`);
        for (let i = 1; i <= 4; i += 1) {
          const dot = document.createElement('i');
          dot.className = i <= t.validatedAt ? 'f' : i <= t.endorsedAt ? 'h' : i <= t.level ? 'd' : 'o';
          dots.appendChild(dot);
        }
        const tag = document.createElement('span');
        tag.className = `t-tag tag-${stage}`;
        tag.textContent = `${LEVELS[t.level - 1]} · ${stageLabel[stage]}${stage === 'endorsed' && t.note ? ` ${t.note}` : ''}`;
        row.append(name, dots, tag);
        items.push(row);
      });
    });
    list.replaceChildren(...items);
  }

  /* ================= growth branches ================= */
  function branchDefs() {
    const teaches = U.indicators.transmission !== 'No';
    const top = U.topics.find((t) => t.level === maxLevel());
    return {
      knowledge: {
        route: 'Member → Mentor', stateLabel: U.assessed && maxLevel() >= 3 && teaches ? 'Mentor review open' : 'Open path', stateCls: U.assessed && maxLevel() >= 3 && teaches ? 'st-ready' : 'st-next',
        kicker: 'Knowledge path', title: 'Community Member → Mentor',
        now: 'You hold: Community Member',
        criteria: [
          { label: 'Level 3+ (Proficient) in at least one topic', done: U.assessed && maxLevel() >= 3 },
          { label: 'Transmission experience (taught or mentored before)', done: U.assessed && teaches },
          { label: 'Availability declared (2+ h / month)', done: U.partC.availability !== '' },
          { label: 'Two references on file', done: U.partC.references !== '' },
        ],
        unlock: 'Opens: the mentor directory, a validation conversation and one trial session.',
        cta: 'Start mentor application', requested: 'Application started ✓',
      },
      project: {
        route: 'Member → Skilled Practitioner', stateLabel: null, stateCls: null,
        kicker: 'Practice path', title: 'Community Member → Skilled Practitioner',
        now: 'You hold: Community Member',
        criteria: [
          { label: 'Level 2+ (Practicing) in at least one topic', done: U.assessed && maxLevel() >= 2 },
          { label: 'Portfolio or LinkedIn on your profile', done: U.partC.portfolio !== '' || U.partC.linkedin !== '' },
          { label: 'Part C of your profile complete', done: partCDone() },
          { label: 'Peer endorsements after a first collaboration', done: false },
        ],
        unlock: `Opens: project conversations${top ? ` in ${top.name}` : ''} and a practitioner pathway.`,
        cta: 'Submit for review', requested: 'Submitted for review ✓',
      },
      territory: {
        route: 'Member → Local Connector', stateLabel: 'Open path', stateCls: 'st-next',
        kicker: 'Territory path', title: `Community Member → Local Connector (${U.city})`,
        now: 'You hold: Community Member',
        criteria: [
          { label: `Territorial knowledge declared (${U.city})`, done: true },
          { label: 'Maps or convenes local actors', done: false },
          { label: 'Validated by the NODAL team', done: false },
        ],
        unlock: 'Opens: local convening, territorial referrals and a path toward community hosting.',
        cta: 'Express interest', requested: 'Interest registered ✓',
      },
      community: {
        route: 'Member → Active Contributor', stateLabel: '0 of 3 actions', stateCls: 'st-next',
        kicker: 'Community path', title: 'Community Member → Active Contributor',
        now: 'You hold: Community Member',
        criteria: [
          { label: '3+ meaningful actions in 90 days · 0 of 3', done: false },
          { label: 'Active 6 consecutive months · 0 of 6', done: false },
        ],
        unlock: 'Opens: recognition and invitations to take part in other community paths.',
        cta: 'See open contribution prompts',
      },
    };
  }

  let currentBranch = 'knowledge';
  const pd = {
    kicker: document.getElementById('pdKicker'),
    title: document.getElementById('pdTitle'),
    now: document.getElementById('pdNow'),
    criteria: document.getElementById('pdCriteria'),
    unlock: document.getElementById('pdUnlock'),
    cta: document.getElementById('pdCta'),
  };

  function showBranch(key) {
    const defs = branchDefs();
    const b = defs[key];
    if (!b || !pd.criteria) return;
    currentBranch = key;
    pd.kicker.textContent = b.kicker;
    pd.title.textContent = b.title;
    pd.now.textContent = b.now;
    pd.unlock.textContent = b.unlock;
    pd.criteria.replaceChildren(...b.criteria.map((c) => {
      const li = document.createElement('li');
      li.textContent = c.label;
      if (c.done) li.classList.add('done');
      return li;
    }));
    pd.cta.disabled = false;
    pd.cta.classList.remove('is-sent');
    if (U.requests[key]) {
      // an already-submitted request stays acknowledged, even if Part C later
      // gains new fields and drops below "complete"
      pd.cta.textContent = b.requested ?? 'Done ✓';
      pd.cta.classList.add('is-sent');
      pd.cta.disabled = true;
    } else if (key === 'project' && !partCDone()) {
      pd.cta.textContent = 'Complete Part C first';
    } else {
      pd.cta.textContent = b.cta;
    }
  }

  function renderPaths() {
    const defs = branchDefs();
    document.querySelectorAll('#pathList .path-row').forEach((row) => {
      const def = defs[row.dataset.branch];
      if (!def) return;
      const em = row.querySelector('em');
      if (em) em.textContent = def.route;
      const pill = row.querySelector('.path-state');
      if (pill) {
        let label = def.stateLabel;
        let cls = def.stateCls;
        if (label === null) {           // project: derived from remaining steps
          const remaining = def.criteria.filter((c) => !c.done).length;
          label = remaining === 0 ? 'Ready for review' : `${remaining} step${remaining > 1 ? 's' : ''} left`;
          cls = remaining === 0 ? 'st-ready' : 'st-next';
        }
        pill.textContent = label;
        pill.className = `path-state ${cls}`;
      }
    });
    showBranch(currentBranch);
  }

  const pathList = document.getElementById('pathList');
  if (pathList && pd.criteria && pd.cta) {
    pathList.querySelectorAll('.path-row').forEach((row) => {
      row.addEventListener('click', () => {
        pathList.querySelectorAll('.path-row').forEach((r) => r.classList.toggle('is-on', r === row));
        showBranch(row.dataset.branch);
      });
    });
    pd.cta.addEventListener('click', () => {
      if (currentBranch === 'project' && !partCDone()) { openPartC(); return; }
      if (currentBranch === 'community') {
        document.getElementById('badges')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      U.requests[currentBranch] = true;
      touchUser();
      showBranch(currentBranch);
    });
  }

  /* ================= badges ================= */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function familyMark(fam) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const el = (tag, attrs) => {
      const node = document.createElementNS(SVGNS, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      svg.appendChild(node);
    };
    if (fam === 'Role') {
      el('line', { x1: 12.5, y1: 10.6, x2: 16, y2: 8.6, stroke: 'currentColor', 'stroke-width': 1.8 });
      el('circle', { cx: 9, cy: 12.5, r: 4.5, fill: 'currentColor' });
      el('circle', { cx: 17.5, cy: 7.8, r: 2.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 });
    } else if (fam === 'Recognition') {
      el('circle', { cx: 12, cy: 12, r: 3.6, fill: 'currentColor' });
      [[12, 4.5, 12, 7.5], [12, 16.5, 12, 19.5], [4.5, 12, 7.5, 12], [16.5, 12, 19.5, 12]].forEach(([x1, y1, x2, y2]) =>
        el('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    } else {
      el('line', { x1: 9, y1: 14.2, x2: 14.8, y2: 9.8, stroke: 'currentColor', 'stroke-width': 1.8 });
      el('circle', { cx: 7.2, cy: 15.8, r: 3, fill: 'currentColor' });
      el('circle', { cx: 16.8, cy: 8.2, r: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 });
    }
    return svg;
  }

  function badgeData() {
    const mentorReady = U.assessed && maxLevel() >= 3 && U.indicators.transmission !== 'No';
    return [
      { fam: 'Contribution', name: 'Profile Pioneer', scope: U.assessed ? 'Self-assessment done' : 'Complete the self-assessment', unlock: 'suggested path · better connections', state: U.assessed ? 'earned' : 'progress' },
      { fam: 'Contribution', name: 'First Contribution', scope: 'Share your first resource or post', unlock: 'starts your Active Contributor path', state: 'locked' },
      { fam: 'Contribution', name: 'Knowledge Sharer', scope: '0 of 5 resources shared', unlock: 'community visibility · facilitation shortlist', state: 'locked' },
      { fam: 'Contribution', name: 'Event Host', scope: 'Host or co-host a community event', unlock: 'facilitation and connector pathways', state: 'locked' },
      { fam: 'Contribution', name: 'Connector', scope: '0 of 5 introductions', unlock: 'local connector pathway', state: 'locked' },
      { fam: 'Contribution', name: 'Course Graduate', scope: 'Complete a NODAL course', unlock: 'supports your topic levels', state: 'locked' },
      { fam: 'Contribution', name: 'Consistent Member', scope: '0 of 6 active months', unlock: 'priority access to small-group programs', state: 'locked' },
      { fam: 'Role', name: 'Skilled Practitioner', scope: 'Level 2–3 + endorsements', unlock: 'community profile · project conversations', state: 'locked' },
      { fam: 'Role', name: 'Mentor', scope: mentorReady ? 'Mentor review open · apply below' : 'Level 3+ + transmission + validation', unlock: 'mentor directory · learning circles', state: mentorReady ? 'progress' : 'locked' },
      { fam: 'Role', name: 'Local Connector', scope: U.city, unlock: 'local convening · territorial referrals', state: 'locked' },
      { fam: 'Recognition', name: 'Founding Member', scope: 'First cohort · by invitation', unlock: 'founding price · early community formats', state: 'locked' },
    ];
  }

  function renderBadges() {
    const grid = document.getElementById('badgeGrid');
    if (!grid) return;
    grid.replaceChildren(...badgeData().map((b) => {
      const tile = document.createElement('article');
      tile.className = `badge is-${b.state}`;
      const top = document.createElement('div');
      top.className = 'badge-top';
      const ico = document.createElement('span');
      ico.className = 'badge-ico';
      ico.appendChild(familyMark(b.fam));
      const fam = document.createElement('span');
      fam.className = 'badge-fam';
      fam.textContent = b.state === 'locked' ? `${b.fam} · locked` : b.state === 'progress' ? `${b.fam} · in progress` : b.fam;
      top.append(ico, fam);
      const name = document.createElement('h3');
      name.className = 'badge-name';
      name.textContent = b.name;
      const scope = document.createElement('small');
      scope.textContent = b.scope;
      name.appendChild(scope);
      const unlock = document.createElement('p');
      unlock.className = 'badge-unlock';
      const strong = document.createElement('strong');
      strong.textContent = 'Opens: ';
      unlock.append(strong, b.unlock);
      tile.append(top, name, unlock);
      return tile;
    }));
  }

  /* ================= self-assessment ================= */
  const TRACKS = {
    leader: { name: 'Leader / Mentor potential', why: 'Level 3+ in a topic, transmission experience, and your intent says you can offer mentoring.' },
    specialist: { name: 'Specialist', why: 'Level 3–4 and you lead work. Practitioner review and expert sessions are your fastest routes.' },
    practitioner: { name: 'Practitioner', why: 'Level 2–3 with project experience. Contribution prompts and endorsements will move you fastest.' },
    learner: { name: 'Learner', why: 'You are exploring. Courses, open events and find-a-mentor are the right starting doors.' },
  };

  function evaluateTrack() {
    const trackName = document.getElementById('trackName');
    const trackWhy = document.getElementById('trackWhy');
    const fastTrack = document.getElementById('fastTrack');
    if (!trackName) return;
    const teaches = U.indicators.transmission !== 'No';
    const leads = U.indicators.leadership !== 'No';
    let track;
    if (!U.assessed) track = { name: 'Pending', why: 'Rate your topics and answer the two questions. Your track appears instantly.' };
    else if (maxLevel() >= 3 && teaches) track = TRACKS.leader;
    else if (maxLevel() >= 3 && leads) track = TRACKS.specialist;
    else if (maxLevel() >= 2) track = TRACKS.practitioner;
    else track = TRACKS.learner;
    trackName.textContent = track.name;
    trackWhy.textContent = track.why;
    if (fastTrack) fastTrack.hidden = track !== TRACKS.leader;
  }

  function markAssessed() {
    if (!U.assessed) U.assessed = true;
    touchUser();
  }

  function renderAssessment() {
    const host = document.getElementById('assessTopics');
    if (!host) return;
    host.replaceChildren(...U.topics.map((topic) => {
      const wrap = document.createElement('div');
      wrap.className = 'assess-topic';
      const head = document.createElement('div');
      head.className = 'assess-head';
      const label = document.createElement('strong');
      label.textContent = topic.name;
      const status = document.createElement('span');
      status.textContent = `${LEVELS[topic.level - 1]} · ${stageLabel[stageOf(topic)]}`;
      head.append(label, status);
      const seg = document.createElement('div');
      seg.className = 'seg';
      LEVELS.forEach((name, i) => {
        const level = i + 1;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name;
        if (level === topic.level) btn.classList.add('is-on');
        if (level === 4 && topic.validatedAt < 4) {
          btn.disabled = true;
          btn.title = 'Reference is granted through NODAL validation';
        }
        btn.addEventListener('click', () => {
          topic.level = level;
          markAssessed();
          renderAssessment();
          renderTrust();
          evaluateTrack();
          renderCompleteness();
          renderRoles();
          renderMentorCard();
          renderBadges();
          renderPaths();
        });
        seg.appendChild(btn);
      });
      wrap.append(head, seg);
      return wrap;
    }));
    // sync the two indicator rows to the active user
    document.querySelectorAll('.seg[data-ind]').forEach((seg) => {
      const saved = U.indicators[seg.dataset.ind];
      seg.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('is-on', btn.textContent === saved);
      });
    });
  }

  document.querySelectorAll('.seg[data-ind]').forEach((seg) => {
    seg.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === btn));
        U.indicators[seg.dataset.ind] = btn.textContent;
        markAssessed();
        evaluateTrack();
        renderRoles();
        renderMentorCard();
        renderBadges();
        renderPaths();
        renderCompleteness();
      });
    });
  });

  const fastBtn = document.getElementById('fastTrackBtn');
  function renderFastBtn() {
    if (!fastBtn) return;
    fastBtn.disabled = U.mentorApplied;
    fastBtn.classList.toggle('is-sent', U.mentorApplied);
    fastBtn.textContent = U.mentorApplied ? 'Application started ✓' : 'Start mentor application';
  }
  fastBtn?.addEventListener('click', () => {
    U.mentorApplied = true;
    touchUser();
    renderFastBtn();
  });

  /* ================= Part C + completeness ================= */
  const partCFields = ['bio', 'linkedin', 'portfolio', 'references', 'availability'];
  const partCTotal = partCFields.length;
  const partCCount = () => partCFields.filter((f) => String(U.partC[f] ?? '').trim() !== '').length;
  const partCDone = () => partCCount() === partCTotal;

  function renderCompleteness() {
    const pct = 30 + (U.assessed ? 30 : 0) + Math.round(40 * (partCCount() / partCTotal));
    const ringVal = document.getElementById('ringVal');
    if (ringVal) {
      const C = 2 * Math.PI * 34;
      const on = (C * pct) / 100;
      ringVal.setAttribute('stroke-dasharray', `${on.toFixed(1)} ${(C - on).toFixed(1)}`);
    }
    const ringText = document.getElementById('ringText');
    if (ringText) ringText.textContent = `${pct}%`;
    document.getElementById('ringSvg')?.setAttribute('aria-label', `Profile ${pct} percent complete`);
    const parts = document.querySelectorAll('.parts li');
    if (parts.length === 3) {
      parts[1].classList.toggle('done', U.assessed);
      parts[1].textContent = U.assessed ? 'Part B · Self-assessment' : 'Part B · Self-assessment · pending';
      parts[2].classList.toggle('done', partCDone());
      parts[2].textContent = partCDone() ? 'Part C · Depth' : `Part C · Depth · ${partCCount()} of ${partCTotal}`;
    }
    const note = document.getElementById('partCNote');
    if (note) {
      note.textContent = partCDone()
        ? 'Part C complete. Mentor and practitioner validation can enter review.'
        : 'Completing Part C opens mentor and practitioner validation.';
    }
    const btn = document.getElementById('partCBtn');
    if (btn) btn.textContent = partCDone() ? 'Edit Part C' : 'Complete Part C';
  }

  const pcDialog = document.getElementById('partCDialog');
  const pcForm = document.getElementById('partCForm');
  const pc = {
    bio: document.getElementById('pcBio'),
    linkedin: document.getElementById('pcLinkedin'),
    portfolio: document.getElementById('pcPortfolio'),
    references: document.getElementById('pcRefs'),
    availability: document.getElementById('pcAvail'),
    consent: document.getElementById('pcConsent'),
    error: document.getElementById('pcError'),
  };
  const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]+/;
  function openPartC() {
    if (!pcDialog || !pcForm) return;
    pc.bio.value = U.partC.bio;
    pc.linkedin.value = U.partC.linkedin;
    pc.portfolio.value = U.partC.portfolio;
    pc.references.value = U.partC.references;
    pc.availability.value = U.partC.availability;
    pc.consent.checked = U.partC.consent;
    pc.error.hidden = true;
    if (typeof pcDialog.showModal === 'function') pcDialog.showModal();
  }
  if (pcDialog && pcForm) {
    document.getElementById('partCBtn')?.addEventListener('click', openPartC);
    document.getElementById('pcCancel')?.addEventListener('click', () => pcDialog.close());
    pcForm.addEventListener('submit', (e) => {
      const url = pc.portfolio.value.trim();
      if (url && !/^https?:\/\/\S+\.\S+/.test(url)) {
        e.preventDefault();
        pc.error.textContent = 'Portfolio link must start with http:// or https://';
        pc.error.hidden = false;
        return;
      }
      const li = pc.linkedin.value.trim();
      if (li && !LINKEDIN_RE.test(li)) {
        e.preventDefault();
        pc.error.textContent = 'LinkedIn link must look like https://www.linkedin.com/in/your-name';
        pc.error.hidden = false;
        return;
      }
      U.partC = {
        bio: pc.bio.value.trim(),
        linkedin: li,
        portfolio: url,
        references: pc.references.value.trim(),
        availability: pc.availability.value,
        consent: pc.consent.checked,
      };
      touchUser();
      renderIdentity();
      renderCompleteness();
      renderPaths();
    });
  }

  /* ================= user dialog ================= */
  const userDialog = document.getElementById('userDialog');
  const userForm = document.getElementById('userForm');
  let openUserDialog = () => {};
  const uc = {
    name: document.getElementById('ucName'),
    city: document.getElementById('ucCity'),
    cityOptions: document.getElementById('ucCityOptions'),
    role: document.getElementById('ucRole'),
    topics: document.getElementById('ucTopics'),
    error: document.getElementById('ucError'),
    dataControls: document.getElementById('ucDataControls'),
    exportData: document.getElementById('ucExport'),
    deleteAccount: document.getElementById('ucDelete'),
  };
  if (userDialog && userForm) {
    let cityTimer = null;
    let cityAbort = null;
    const setCityOptions = (cities) => {
      if (!uc.cityOptions) return;
      uc.cityOptions.replaceChildren(...cities.map((city) => {
        const option = document.createElement('option');
        option.value = city.label || city.name;
        option.label = city.region ? `${city.name} · ${city.region}` : city.name;
        return option;
      }));
    };
    const scheduleCitySearch = () => {
      clearTimeout(cityTimer);
      const query = cleanCity(uc.city.value);
      if (query.length < 2) {
        setCityOptions([]);
        return;
      }
      cityTimer = setTimeout(async () => {
        if (cityAbort) cityAbort.abort();
        cityAbort = new AbortController();
        try {
          const data = await api(`/api/cities?q=${encodeURIComponent(query)}`, { signal: cityAbort.signal });
          setCityOptions(Array.isArray(data.cities) ? data.cities : []);
        } catch (err) {
          if (err.name !== 'AbortError') setCityOptions([]);
        }
      }, 280);
    };
    uc.city?.addEventListener('input', scheduleCitySearch);
    TAXONOMY.forEach((t) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = t;
      input.addEventListener('change', () => {
        const checked = uc.topics.querySelectorAll('input:checked');
        if (checked.length > 3) input.checked = false;
      });
      label.append(input, t);
      uc.topics.appendChild(label);
    });

    const ucTitle = document.getElementById('ucTitle');
    const ucSub = document.getElementById('ucSub');
    const ucSubmit = document.getElementById('ucSubmit');
    openUserDialog = () => {
      uc.error.hidden = true;
      // members edit in place; first visits complete the account profile
      const editing = U.kind === 'member';
      if (ucTitle) ucTitle.textContent = editing ? 'Edit your profile' : 'Who’s exploring today?';
      if (ucSub) {
        ucSub.textContent = editing
          ? 'Update your identity! Your profile is the heart of your dashboard experience, so keep it fresh as you grow.'
          : 'Complete your profile so connections, paths and member tools can use real data.';
      }
      if (ucSubmit) ucSubmit.textContent = editing ? 'Save changes' : 'Create profile';
      if (uc.dataControls) uc.dataControls.hidden = !editing;
      uc.name.value = editing ? U.name : '';
      uc.city.value = editing ? U.city : '';
      uc.role.value = editing ? U.role : '';
      setCityOptions(editing && U.city ? [{ name: U.city, label: U.city }] : []);
      const current = new Set(editing ? U.topics.map((t) => t.name) : []);
      uc.topics.querySelectorAll('input').forEach((i) => { i.checked = current.has(i.value); });
      if (typeof userDialog.showModal === 'function' && !userDialog.open) userDialog.showModal();
    };
    document.getElementById('userBtn')?.addEventListener('click', openUserDialog);

    userForm.addEventListener('submit', (e) => {
      const name = uc.name.value.trim();
      const city = cleanCity(uc.city.value);
      const role = cleanRole(uc.role.value);
      const topics = [...uc.topics.querySelectorAll('input:checked')].map((i) => i.value);
      if (!name || !city || !role || topics.length === 0) {
        e.preventDefault();
        uc.error.textContent = !name
          ? 'Add your name to create the profile.'
          : !city
            ? 'Add your city to place your profile in the community.'
            : !role
              ? 'Add your current role.'
              : 'Pick at least one topic.';
        uc.error.hidden = false;
        return;
      }
      if (U.kind === 'member') {
        // edit in place — keep levels and validation for topics that stay
        U.name = name;
        U.city = city;
        U.role = role;
        const byName = new Map(U.topics.map((t) => [t.name, t]));
        U.topics = topics.map((n) => byName.get(n) ?? makeTopic(n));
        setUser(U);
      } else {
        setUser(newUser(name, city, role, topics));
      }
    });

    uc.exportData?.addEventListener('click', async () => {
      try {
        const exported = await api('/api/me/export');
        const blob = new Blob([JSON.stringify(exported.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nodal-member-data.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        uc.error.textContent = err.message || 'Could not export your data.';
        uc.error.hidden = false;
      }
    });

    uc.deleteAccount?.addEventListener('click', async () => {
      const email = prompt('Type your account email to delete your NODAL account.');
      if (!email) return;
      try {
        await api('/api/me', { method: 'DELETE', body: JSON.stringify({ confirmEmail: email }) });
        location.assign('/login.html');
      } catch (err) {
        uc.error.textContent = err.message || 'Could not delete this account.';
        uc.error.hidden = false;
      }
    });
  }

  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      location.assign('/login.html');
    }
  });

  /* ================= timeline + week strip ================= */
  function timelineData() {
    const first = U.topics[0]?.name ?? 'your topic';
    return [
      { time: 'Today', name: 'Profile created · Part A complete', sub: 'Badge progress: Profile Pioneer', cls: 'tl-strong' },
      { time: 'Next', name: U.assessed ? 'Track suggested · explore your branches' : 'Complete your self-assessment', sub: 'Takes about 4 minutes' },
      { time: 'Suggested', name: `Browse the ${first} feed`, sub: 'Courses and open calls in your topics' },
      { time: 'Suggested', name: `Join the next knowledge circle · ${U.city}`, sub: 'Your city chapter', cls: 'tl-soft' },
      { time: 'Later', name: 'Mentorship session', sub: 'Available after first community connection', cls: 'tl-soft', extra: true },
      { time: 'Locked', name: 'First introduction', sub: 'Counts toward the Connector badge', extra: true },
    ];
  }

  function renderTimeline() {
    const tline = document.getElementById('tline');
    const tlMore = document.getElementById('tlMore');
    if (!tline) return;
    const expanded = tlMore?.getAttribute('aria-expanded') === 'true';
    tline.replaceChildren(...timelineData().map((item) => {
      const li = document.createElement('li');
      if (item.cls) li.className = item.cls;
      if (item.extra) { li.classList.add('tl-extra'); li.hidden = !expanded; }
      const time = document.createElement('span');
      time.className = 'tl-time';
      time.textContent = item.time;
      const name = document.createElement('p');
      name.className = 'tl-name';
      name.textContent = item.name;
      const sub = document.createElement('p');
      sub.className = 'tl-sub';
      sub.textContent = item.sub;
      li.append(time, name, sub);
      return li;
    }));
  }

  const tlMore = document.getElementById('tlMore');
  if (tlMore) {
    tlMore.addEventListener('click', () => {
      const expand = tlMore.getAttribute('aria-expanded') !== 'true';
      document.querySelectorAll('.tl-extra').forEach((li) => { li.hidden = !expand; });
      tlMore.setAttribute('aria-expanded', String(expand));
      tlMore.textContent = expand ? 'Show less' : 'View all activity';
    });
  }

  const strip = document.getElementById('weekStrip');
  if (strip) {
    const names = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const li = document.createElement('li');
      if (d.toDateString() === today.toDateString()) li.classList.add('is-today');
      const day = document.createElement('span');
      day.className = 'w-day';
      day.textContent = names[i];
      const num = document.createElement('span');
      num.className = 'w-num';
      num.textContent = String(d.getDate());
      li.append(day, num);
      strip.appendChild(li);
    }
  }

  /* ================= search ================= */
  const currentCity = (fallback = 'Your city') => U?.city || fallback;
  const SEARCH_DATA = {
    People: [],
    Projects: [
      { label: 'Community engagement project', meta: `${currentCity()} · active`, href: 'index.html#platform' },
      { label: 'Cycling network audit', meta: `${currentCity('Regional')} · open`, href: 'index.html#platform' },
      { label: 'Corridor housing study', meta: 'Regional · forming team', href: 'index.html#platform' },
    ],
    Knowledge: [
      { label: 'Urban data basics', meta: 'Course · module 3 of 8', href: 'index.html#resources' },
      { label: 'Participatory design toolkit', meta: 'Library', href: 'index.html#resources' },
      { label: 'Mobility evidence briefs', meta: 'Library · 12 entries', href: 'index.html#resources' },
    ],
    Opportunities: [
      { label: 'Community engagement lead', meta: `${currentCity()} · paid`, href: 'index.html#membership' },
      { label: 'GIS volunteer · flood mapping', meta: 'Regional', href: 'index.html#membership' },
      { label: 'Open call: public space fellows', meta: 'Regional · closes Jul 15', href: 'index.html#membership' },
    ],
  };
  fetch('/api/users').then((r) => (r.ok ? r.json() : null)).then((data) => {
    if (!data || !Array.isArray(data.users)) return;
    const people = data.users
      .filter((u) => u && typeof u.name === 'string' && u.id !== U?.id)
      .map((u) => ({ label: u.name, meta: `${u.role} · ${u.city}`, href: 'profile.html' }));
    if (people.length) SEARCH_DATA.People = people;
  }).catch(() => { /* static hosting */ });

  const searchInput = document.getElementById('searchInput');
  const searchPop = document.getElementById('searchPop');
  const chipHost = document.getElementById('searchChips');
  const activeScope = () => chipHost?.querySelector('.chip.is-on')?.textContent ?? 'People';
  function runSearch() {
    if (!searchInput || !searchPop) return;
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) { searchPop.hidden = true; return; }
    const scope = activeScope();
    const hits = (SEARCH_DATA[scope] ?? [])
      .filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(q))
      .slice(0, 6);
    searchPop.replaceChildren(...(hits.length ? hits.map((item) => {
      const a = document.createElement('a');
      a.className = 'search-hit';
      a.href = item.href;
      const label = document.createElement('strong');
      label.textContent = item.label;
      const meta = document.createElement('span');
      meta.textContent = item.meta;
      a.append(label, meta);
      return a;
    }) : [(() => {
      const p = document.createElement('p');
      p.className = 'search-empty';
      p.textContent = `No matches for “${searchInput.value.trim()}” in ${scope}.`;
      return p;
    })()]));
    searchPop.hidden = false;
  }
  if (searchInput && searchPop && chipHost) {
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') searchPop.hidden = true; });
    chipHost.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chipHost.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === chip));
        runSearch();
        searchInput.focus();
      });
    });
  }

  /* ================= notifications ================= */
  function notifData() {
    return [
      { title: 'Welcome to NODAL', sub: 'Say hello in the community space' },
      { title: U.assessed ? 'Your path is ready' : 'Complete your self-assessment', sub: U.assessed ? 'See your community paths' : 'Opens your suggested path' },
      { title: 'Community host cohort opens Q3', sub: 'Territory path · applications soon' },
    ];
  }
  const notifBtn = document.getElementById('notifBtn');
  const notifPop = document.getElementById('notifPop');
  const notifDot = document.getElementById('notifDot');
  const notifList = document.getElementById('notifList');
  const notifClear = document.getElementById('notifClear');
  function renderNotifs() {
    if (!notifList) return;
    notifList.replaceChildren(...notifData().map((n) => {
      const li = document.createElement('li');
      const t = document.createElement('strong');
      t.textContent = n.title;
      const s = document.createElement('span');
      s.textContent = n.sub;
      li.append(t, s);
      return li;
    }));
    if (notifDot) notifDot.hidden = state.notifRead;
    if (notifClear) {
      notifClear.disabled = state.notifRead;
      notifClear.textContent = state.notifRead ? 'All read ✓' : 'Mark all as read';
    }
  }
  if (notifBtn && notifPop) {
    notifBtn.addEventListener('click', () => {
      notifPop.hidden = !notifPop.hidden;
      notifBtn.setAttribute('aria-expanded', String(!notifPop.hidden));
    });
    notifClear?.addEventListener('click', () => {
      state.notifRead = true;
      touchUser();
      renderNotifs();
    });
  }
  document.addEventListener('click', (e) => {
    if (searchPop && !searchPop.hidden && !e.target.closest('.search')) searchPop.hidden = true;
    if (notifPop && !notifPop.hidden && !e.target.closest('.top-actions')) {
      notifPop.hidden = true;
      notifBtn?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (searchPop) searchPop.hidden = true;
    if (notifPop) { notifPop.hidden = true; notifBtn?.setAttribute('aria-expanded', 'false'); }
  });

  /* ================= scroll spy ================= */
  const sections = ['overview', 'growth', 'badges', 'assessment']
    .map((id) => document.getElementById(id)).filter(Boolean);
  const links = new Map(
    [...document.querySelectorAll('.side-link[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]),
  );
  if (sections.length && links.size) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a, id) => a.classList.toggle('is-active', id === entry.target.id));
      });
    }, { rootMargin: '-30% 0px -55% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  /* ================= apply everything ================= */
  function applyAll() {
    if (!U) return;
    renderIdentity();
    renderRoles();
    renderMentorCard();
    renderTrust();
    renderAssessment();
    evaluateTrack();
    renderFastBtn();
    renderCompleteness();
    renderBadges();
    renderPaths();
    renderTimeline();
    renderNotifs();
  }
  async function init() {
    try {
      const data = await api('/api/auth/me');
      U = normalizeApiUser(data.user);
      state.user = U;
      state.notifRead = U.notifRead;
      applyAll();
      if (!U.city || !U.role || U.topics.length === 0) openUserDialog();
    } catch {
      // api() handles the login redirect for 401. Other failures leave the page
      // quiet instead of showing stale hardcoded state.
    }
  }
  init();
})();
