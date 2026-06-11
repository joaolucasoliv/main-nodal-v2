/* platform: tabs + the network graph + node card.
   All DOM via createElement/textContent (CSP-safe: no innerHTML, no inline
   style attributes — geometry goes through SVG attributes and CSS custom
   props). Labels and card content read from the i18n'd .gc-pool, so
   language switches re-render correctly. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- section tabs ---------- */
  const tabs = [...document.querySelectorAll('.plat-tab')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  function selectTab(i) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (panels[k]) panels[k].hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(i));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      selectTab(n);
      tabs[n].focus();
    });
  });

  /* ---------- graph data (hybrid: actors around the project hub) ---------- */
  const N = [
    { id: 'project',    x: 450, y: 285, r: 16, hub: true },
    { id: 'citygov',    x: 170, y: 110, r: 9 },
    { id: 'investor',   x: 430, y:  70, r: 9 },
    { id: 'ngo',        x: 720, y: 110, r: 9 },
    { id: 'architect',  x: 110, y: 300, r: 9 },
    { id: 'researcher', x: 295, y: 215, r: 9 },
    { id: 'mobility',   x: 600, y: 220, r: 9 },
    { id: 'economist',  x: 800, y: 310, r: 9 },
    { id: 'community',  x: 250, y: 435, r: 9 },
    { id: 'civil',      x: 565, y: 440, r: 9 },
  ];
  const E = [
    ['project', 'researcher'], ['project', 'mobility'], ['project', 'community'], ['project', 'civil'],
    ['researcher', 'citygov'], ['researcher', 'architect'], ['researcher', 'community'], ['researcher', 'mobility'],
    ['mobility', 'investor'], ['mobility', 'economist'], ['mobility', 'ngo'], ['mobility', 'civil'],
    ['citygov', 'investor'], ['ngo', 'economist'], ['civil', 'community'], ['citygov', 'architect'],
  ];
  const idx = new Map(N.map((n, i) => [n.id, i]));
  const adj = N.map(() => new Set());
  E.forEach(([a, b]) => { adj[idx.get(a)].add(idx.get(b)); adj[idx.get(b)].add(idx.get(a)); });

  const pool = document.querySelector('.gc-pool');
  const svg = document.getElementById('graph');
  const card = document.getElementById('graphCard');
  if (!svg || !card || !pool) return;
  const poolOf = (id) => pool.querySelector(`[data-node="${id}"]`);
  const labelOf = (id) => poolOf(id)?.querySelector('h3')?.textContent ?? id;

  /* ---------- build the svg ---------- */
  const COL = {
    edge: 'rgba(61,92,56,.22)', edgeDim: 'rgba(61,92,56,.08)', edgeOn: '#59bc53',
    hubEdge: 'rgba(89,188,83,.45)', node: '#3d5c38', hub: '#59bc53', ring: '#addea8',
  };
  const edgeEls = E.map(([a, b]) => {
    const l = document.createElementNS(NS, 'line');
    const A = N[idx.get(a)], B = N[idx.get(b)];
    l.setAttribute('x1', A.x); l.setAttribute('y1', A.y);
    l.setAttribute('x2', B.x); l.setAttribute('y2', B.y);
    l.setAttribute('stroke', COL.edge); l.setAttribute('stroke-width', '1.5');
    svg.appendChild(l);
    return l;
  });
  const nodeEls = N.map((n, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', n.hub ? 'gnode ghub' : 'gnode');
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', labelOf(n.id));
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', n.x); ring.setAttribute('cy', n.y);
    ring.setAttribute('r', n.r + 4);
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', COL.ring);
    ring.setAttribute('stroke-width', n.hub ? '2.5' : '1.5');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', n.r);
    c.setAttribute('fill', n.hub ? COL.hub : COL.node);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + n.r + 18);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'glabel');
    t.setAttribute('data-i18n', `graph.n.${n.id}.t`);
    t.textContent = labelOf(n.id);
    g.append(ring, c, t);
    svg.appendChild(g);
    g.addEventListener('mouseenter', () => highlight(i));
    g.addEventListener('mouseleave', () => (selected === null ? reset() : highlight(selected)));
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
    return { g, c, ring, t };
  });

  function highlight(i) {
    edgeEls.forEach((l, k) => {
      const [a, b] = E[k];
      const on = idx.get(a) === i || idx.get(b) === i;
      l.setAttribute('stroke', on ? COL.edgeOn : COL.edgeDim);
      l.setAttribute('stroke-width', on ? '2.5' : '1');
    });
    nodeEls.forEach((el, k) => {
      el.g.classList.toggle('is-dim', !(k === i || adj[i].has(k)));
      el.c.setAttribute('r', k === i ? N[k].r + 3 : N[k].r);
    });
  }
  function reset() {
    edgeEls.forEach((l, k) => {
      const hubEdge = E[k][0] === 'project' || E[k][1] === 'project';
      l.setAttribute('stroke', hubEdge ? COL.hubEdge : COL.edge);
      l.setAttribute('stroke-width', '1.5');
    });
    nodeEls.forEach((el, k) => { el.g.classList.remove('is-dim'); el.c.setAttribute('r', N[k].r); });
  }

  /* ---------- shortest path from the hub (BFS) ---------- */
  function pathFromHub(target) {
    const prev = new Map([[0, null]]);
    let frontier = [0];
    while (frontier.length && !prev.has(target)) {
      const next = [];
      for (const u of frontier) {
        for (const v of adj[u]) if (!prev.has(v)) { prev.set(v, u); next.push(v); }
      }
      frontier = next;
    }
    const path = [];
    for (let cur = target; cur !== null && cur !== undefined; cur = prev.get(cur)) path.unshift(cur);
    return path;
  }

  /* ---------- node card ---------- */
  let selected = null;
  let cardTab = 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const uiText = (key, fallback) =>
    document.querySelector(`.gc-ui [data-i18n="${key}"]`)?.textContent ?? fallback;

  function buildCard(i) {
    const n = N[i];
    const src = poolOf(n.id);
    if (!src) return;
    card.replaceChildren();

    const head = el('div', 'gc-head');
    const title = el('h3', 'gc-title', labelOf(n.id));
    const count = el('span', 'gc-chip', src.querySelector('.gc-count')?.textContent ?? '');
    const close = el('button', 'gc-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', deselect);
    head.append(title, count, close);

    const path = pathFromHub(i);
    const pathP = el('p', 'gc-path');
    path.forEach((k, j) => {
      if (j) pathP.append(el('span', 'gc-arrow', ' → '));
      pathP.append(el('strong', k === i ? 'gc-here' : '', labelOf(N[k].id)));
    });

    const labels = [
      uiText('graph.tabContacts', 'Contacts'),
      uiText('graph.tabConnects', 'Connects with'),
      uiText('graph.tabAsks', 'Typical asks'),
    ];
    const panes = [el('div', 'gc-pane'), el('div', 'gc-pane'), el('div', 'gc-pane')];

    const list = el('ul', 'gc-list');
    src.querySelectorAll('ul li').forEach((li) => list.append(el('li', '', li.textContent)));
    panes[0].append(list);

    const chips = el('div', 'gc-chips');
    [...adj[i]].forEach((k) => {
      const b = el('button', 'gc-peer', labelOf(N[k].id));
      b.type = 'button';
      b.addEventListener('click', () => select(k));
      chips.append(b);
    });
    panes[1].append(chips);

    panes[2].append(el('p', 'gc-ask', src.querySelector('.gc-ask')?.textContent ?? ''));

    const tabsRow = el('div', 'gc-tabs');
    const btns = labels.map((lab, k) => {
      const b = el('button', 'gc-tab' + (k === cardTab ? ' is-on' : ''), lab);
      b.type = 'button';
      b.addEventListener('click', () => {
        cardTab = k;
        btns.forEach((bb, kk) => bb.classList.toggle('is-on', kk === k));
        panes.forEach((p, kk) => { p.hidden = kk !== k; });
      });
      return b;
    });
    panes.forEach((p, k) => { p.hidden = k !== cardTab; });
    tabsRow.append(...btns);
    card.append(head, pathP, tabsRow, ...panes);

    // anchor near the node, clamped to the panel (≤820px CSS turns it into a sheet)
    const px = Math.min(Math.max((n.x / 900) * 100, 6), 62);
    const py = Math.min(Math.max((n.y / 520) * 100, 5), 48);
    card.style.setProperty('--gc-x', `${px.toFixed(1)}%`);
    card.style.setProperty('--gc-y', `${py.toFixed(1)}%`);
  }

  function select(i) {
    selected = i;
    cardTab = 0;
    buildCard(i);
    card.hidden = false;
    highlight(i);
  }
  function deselect() {
    const wasSelected = selected;
    selected = null;
    card.hidden = true;
    reset();
    if (wasSelected !== null) nodeEls[wasSelected].g.focus();
  }
  svg.addEventListener('click', (e) => { if (e.target === svg) deselect(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) deselect(); });

  /* ---------- intro draw-in (time-based, not scroll-driven) ---------- */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    nodeEls.forEach((eln, i) => {
      eln.g.classList.add('g-in');
      eln.g.style.transitionDelay = `${120 + i * 70}ms`;
    });
    edgeEls.forEach((l, i) => {
      const len = l.getTotalLength ? l.getTotalLength() : 200;
      l.style.strokeDasharray = len;
      l.style.strokeDashoffset = len;
      setTimeout(() => {
        l.style.transition = 'stroke-dashoffset 1s cubic-bezier(.45,0,.25,1)';
        l.style.strokeDashoffset = 0;
      }, 350 + i * 60);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      nodeEls.forEach((elr) => elr.g.classList.add('g-on'));
    }));
    setTimeout(reset, 350 + edgeEls.length * 60 + 1100);
  } else {
    reset();
  }
})();
