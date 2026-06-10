/* landing interactions: scroll reveals, match card, network graph */
(() => {
  const NS = 'http://www.w3.org/2000/svg';


  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 60}ms`;
    io.observe(el);
  });

  const stack = document.getElementById('matchStack');
  if (stack) {
    const card = stack.querySelector('.match-card');
    const fling = (dir) => {
      card.style.transform = `translateX(${dir * 120}%) rotate(${dir * 12}deg)`;
      card.style.opacity = '0';
      setTimeout(() => {
        card.style.transition = 'none';
        card.style.transform = `translateX(${-dir * 30}%)`;
        // small reset so it can be re-demoed
        requestAnimationFrame(() => {
          card.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s ease';
          card.style.transform = 'none';
          card.style.opacity = '1';
        });
      }, 380);
    };
    card.querySelector('.m-skip').addEventListener('click', () => fling(-1));
    card.querySelector('.m-like').addEventListener('click', () => fling(1));
  }

  /* ---------- matching graph (nodes / edges / vertices) ---------- */
  const svg = document.getElementById('graph');
  if (svg) {
    const N = [
      { x:170, y:110, label:'City Government',  type:'Public sector',    desc:'Sets the priorities, permits and budgets that decide whether a project moves.' },              // 0
      { x:430, y: 70, label:'Investor',         type:'Capital',          desc:'Deploys capital into projects — and needs trusted local signals to do it.' },                  // 1
      { x:720, y:110, label:'NGO / Foundation', type:'Civil society',    desc:'Funds and runs programs where public capacity falls short.' },                                 // 2
      { x:110, y:290, label:'Architect',        type:'Design talent',    desc:'Shapes the built form; abundant in the region, often disconnected from delivery.' },           // 3
      { x:310, y:235, label:'Researcher',       type:'Knowledge',        desc:'Produces the evidence that de-risks decisions on the ground.' },                               // 4
      { x:560, y:250, label:'Mobility Engineer',type:'Technical talent', desc:'Scarce, in-demand profile: 1–3K graduate each year across 22 countries.' },                    // 5
      { x:800, y:300, label:'Urban Economist',  type:'Knowledge',        desc:'Reads the market and social value behind every intervention.' },                               // 6
      { x:250, y:430, label:'Community Leader', type:'Community',        desc:'Holds the local trust that makes or breaks implementation.' },                                 // 7
      { x:540, y:440, label:'Civil Engineer',   type:'Technical talent', desc:'Turns plans into structures — the delivery backbone.' },                                       // 8
      { x:430, y:330, label:'Project', hub:true,type:'Match target',     desc:'A live urban project being staffed and coordinated through NODAL.' },                          // 9
    ];
    // note: no direct [9,0] edge — it was collinear with [4,0]+[9,4] and
    // rendered as a doubled line through the Researcher node
    const E = [
      [9,4],[9,5],[9,7],[9,8],
      [4,3],[4,0],[4,7],[4,5],
      [5,1],[5,6],[5,2],[5,8],
      [0,1],[2,6],[8,7],
    ];

    // adjacency for hover highlighting
    const adj = N.map(() => new Set());
    E.forEach(([a,b]) => { adj[a].add(b); adj[b].add(a); });

    const edgeEls = E.map(([a,b]) => {
      const l = document.createElementNS(NS,'line');
      l.setAttribute('x1',N[a].x); l.setAttribute('y1',N[a].y);
      l.setAttribute('x2',N[b].x); l.setAttribute('y2',N[b].y);
      l.setAttribute('stroke','rgba(255,255,255,.16)');
      l.setAttribute('stroke-width','2');
      svg.appendChild(l);
      return l;
    });

    // node detail card
    const card = document.getElementById('graphCard');
    const gc = card && {
      type:  document.getElementById('gcType'),
      name:  document.getElementById('gcName'),
      desc:  document.getElementById('gcDesc'),
      count: document.getElementById('gcCount'),
      links: document.getElementById('gcLinks'),
      close: document.getElementById('gcClose'),
    };
    let selected = null;

    function select(i) {
      selected = i;
      highlight(i);
      if (!gc) return;
      gc.type.textContent = N[i].type;
      gc.name.textContent = N[i].label;
      gc.desc.textContent = N[i].desc;
      const peers = [...adj[i]];
      gc.count.textContent = String(peers.length);
      gc.links.replaceChildren(...peers.map((k) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = N[k].label;
        b.addEventListener('click', () => select(k));
        li.appendChild(b);
        return li;
      }));
      card.hidden = false;
    }
    function deselect() {
      selected = null;
      if (card) card.hidden = true;
      reset();
    }
    if (gc) gc.close.addEventListener('click', deselect);
    // clicking the empty panel area also closes the card
    svg.addEventListener('click', (e) => { if (e.target === svg && selected !== null) deselect(); });

    const nodeGroups = N.map((n,i) => {
      const g = document.createElementNS(NS,'g');
      g.style.cursor = 'pointer'; g.style.opacity = '0';
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', `${n.label} — show connections`);
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx',n.x); c.setAttribute('cy',n.y);
      c.setAttribute('r', n.hub ? 15 : 9);
      c.setAttribute('fill', n.hub ? '#59bc53' : '#addea8');
      c.setAttribute('stroke', n.hub ? '#addea8' : 'transparent');
      c.setAttribute('stroke-width','3');
      const t = document.createElementNS(NS,'text');
      t.setAttribute('x', n.x); t.setAttribute('y', n.y - (n.hub ? 24 : 18));
      t.setAttribute('text-anchor','middle');
      t.setAttribute('fill','rgba(255,255,255,.9)');
      t.setAttribute('font-size','13'); t.setAttribute('font-weight','600');
      t.setAttribute('font-family',"'Montserrat',sans-serif");
      t.textContent = n.label;
      g.appendChild(c); g.appendChild(t);
      svg.appendChild(g);

      g.addEventListener('mouseenter', () => highlight(i));
      g.addEventListener('mouseleave', () => (selected === null ? reset() : highlight(selected)));
      g.addEventListener('focus', () => highlight(i));
      g.addEventListener('blur', () => (selected === null ? reset() : highlight(selected)));
      g.addEventListener('click', () => select(i));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
        if (e.key === 'Escape') deselect();
      });
      return { g, c, t };
    });

    function highlight(i) {
      edgeEls.forEach((l, k) => {
        const [a,b] = E[k];
        const on = (a === i || b === i);
        l.setAttribute('stroke', on ? '#59bc53' : 'rgba(255,255,255,.07)');
        l.setAttribute('stroke-width', on ? '3.5' : '1.5');
      });
      nodeGroups.forEach((ng, k) => {
        const on = (k === i || adj[i].has(k));
        ng.g.style.opacity = on ? '1' : '.28';
        ng.c.setAttribute('r', k === i ? (N[k].hub ? 18 : 13) : (N[k].hub ? 15 : 9));
      });
    }
    function reset() {
      edgeEls.forEach((l,k) => {
        const hub = E[k].includes(9);
        l.setAttribute('stroke', hub ? 'rgba(89,188,83,.5)' : 'rgba(255,255,255,.16)');
        l.setAttribute('stroke-width','2');
      });
      nodeGroups.forEach((ng,k) => {
        ng.g.style.opacity = '1';
        ng.c.setAttribute('r', N[k].hub ? 15 : 9);
      });
    }

    // animate in when the graph scrolls into view
    let played = false;
    const gio = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting || played) return;
        played = true;
        edgeEls.forEach(l => {
          const len = l.getTotalLength ? l.getTotalLength() : 200;
          l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
        });
        nodeGroups.forEach((ng,i) => {
          ng.g.style.transition = 'opacity .5s ease';
          setTimeout(() => { ng.g.style.opacity = '1'; }, 150 + i*90);
        });
        edgeEls.forEach((l,i) => {
          setTimeout(() => {
            l.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.45,0,.25,1)';
            l.style.strokeDashoffset = 0;
          }, 400 + i*70);
        });
        setTimeout(reset, 400 + edgeEls.length*70 + 600);
      });
    }, { threshold: 0.3 });
    gio.observe(svg);
  }
})();
