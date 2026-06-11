/* recommendation engine: weighted node graph + collaborative filtering.
   Pure functions over a store snapshot — no mutation, fully testable.

   Edge weight blends four signals (all normalised to 0..1):
     shared interests · mutual connections · engagement history · activity overlap
   Personalised score per candidate combines:
     BFS graph traversal with per-hop decay, direct affinity, and user-user CF. */

import { getEngagement } from './store.js';

/* NOTE: the "How matching works" tab on the landing page displays these
   weights — keep index.html's sig-bars in sync when changing them */
export const WEIGHTS = { interests: 0.30, mutuals: 0.20, engagement: 0.20, activity: 0.10, city: 0.10, complement: 0.10 };
export const DECAY = 0.5;        // score multiplier per extra hop
export const MAX_DEPTH = 3;
export const LINKEDIN_BOOST = 1.05;   // verifiability prior on the final score
const MIX = { traversal: 0.45, direct: 0.30, cf: 0.25 };

/* complementary disciplines — pairs that historically need each other on projects */
const COMPLEMENTS = [
  ['research', 'engineer'], ['research', 'technolog'], ['research', 'designer'],
  ['planner', 'community'], ['planner', 'economist'], ['planner', 'anthropolog'],
  ['architect', 'community'], ['engineer', 'community'],
];

export const cityScore = (a, b) => (a.city === b.city ? 1 : 0);

export function complementScore(a, b) {
  const ra = a.role.toLowerCase(), rb = b.role.toLowerCase();
  for (const [x, y] of COMPLEMENTS) {
    if ((ra.includes(x) && rb.includes(y)) || (ra.includes(y) && rb.includes(x))) return 1;
  }
  return 0;
}

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
};

/* undirected adjacency from the directed follow edges */
export function buildAdjacency(store) {
  const adj = new Map([...store.users.keys()].map((id) => [id, new Set()]));
  for (const [from, tos] of store.follows) {
    for (const to of tos) {
      adj.get(from)?.add(to);
      adj.get(to)?.add(from);
    }
  }
  return adj;
}

function mutualScore(adj, a, b) {
  const na = adj.get(a), nb = adj.get(b);
  if (!na?.size || !nb?.size) return 0;
  let common = 0;
  for (const n of na) if (nb.has(n) && n !== a && n !== b) common += 1;
  return common / Math.sqrt(na.size * nb.size);
}

export function edgeWeight(store, adj, a, b) {
  const ua = store.users.get(a), ub = store.users.get(b);
  const engagement = getEngagement(store, a, b);
  return (
    WEIGHTS.interests  * jaccard(ua.interests, ub.interests) +
    WEIGHTS.mutuals    * mutualScore(adj, a, b) +
    WEIGHTS.engagement * (engagement / (engagement + 3)) +   // saturating
    WEIGHTS.activity   * jaccard(ua.active, ub.active) +
    WEIGHTS.city       * cityScore(ua, ub) +
    WEIGHTS.complement * complementScore(ua, ub)
  );
}

/* layered BFS from src: each node reached at depth d contributes
   bestPathScore(parent) * edgeWeight(parent, node) * DECAY^(d-1),
   summed over parents so multi-path candidates rank higher */
export function traversalScores(store, adj, src) {
  const scores = new Map();
  const best = new Map([[src, 1]]);
  let frontier = [src];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth += 1) {
    const next = new Map();
    for (const u of frontier) {
      for (const v of adj.get(u) ?? []) {
        if (v === src) continue;
        const contribution = best.get(u) * edgeWeight(store, adj, u, v) * DECAY ** (depth - 1);
        scores.set(v, (scores.get(v) ?? 0) + contribution);
        if (!best.has(v) || contribution > best.get(v)) next.set(v, contribution);
      }
    }
    for (const [v, s] of next) if (!best.has(v)) best.set(v, s);
    frontier = [...next.keys()];
  }
  return scores;
}

/* user-user collaborative filtering: people similar to src "vote" for
   whoever they follow, weighted by similarity */
export function cfScores(store, src) {
  const me = store.users.get(src);
  const myFollows = store.follows.get(src);
  const scores = new Map();
  for (const [otherId, other] of store.users) {
    if (otherId === src) continue;
    const followSim = jaccard([...myFollows], [...store.follows.get(otherId)]);
    const sim = 0.5 * followSim + 0.5 * jaccard(me.interests, other.interests);
    if (sim === 0) continue;
    for (const t of store.follows.get(otherId)) {
      if (t === src || myFollows.has(t)) continue;
      scores.set(t, (scores.get(t) ?? 0) + sim);
    }
  }
  return scores;
}

const normalize = (m) => {
  const max = Math.max(0, ...m.values());
  if (max === 0) return m;
  return new Map([...m].map(([k, v]) => [k, v / max]));
};

export function recommend(store, userId, { limit = 6 } = {}) {
  const me = store.users.get(userId);
  if (!me) return null;
  const adj = buildAdjacency(store);
  const following = store.follows.get(userId);

  const traversal = normalize(traversalScores(store, adj, userId));
  const cf = normalize(cfScores(store, userId));
  const direct = normalize(new Map(
    [...store.users.keys()]
      .filter((id) => id !== userId)
      .map((id) => [id, edgeWeight(store, adj, userId, id)]),
  ));

  const results = [];
  for (const [id, user] of store.users) {
    if (id === userId || following.has(id)) continue;
    let score =
      MIX.traversal * (traversal.get(id) ?? 0) +
      MIX.direct    * (direct.get(id) ?? 0) +
      MIX.cf        * (cf.get(id) ?? 0);
    if (score <= 0) continue;
    if (user.linkedin) score *= LINKEDIN_BOOST;

    const shared = me.interests.filter((i) => user.interests.includes(i));
    let mutuals = 0;
    for (const n of adj.get(id)) if (following.has(n)) mutuals += 1;

    results.push({
      id,
      name: user.name,
      role: user.role,
      city: user.city,
      interests: user.interests,
      score: Number(score.toFixed(4)),
      reasons: {
        sharedInterests: shared,
        mutualConnections: mutuals,
        sameCity: user.city === me.city,
        complementaryRole: complementScore(me, user) ? user.role : null,
        hasLinkedin: Boolean(user.linkedin),
      },
    });
  }
  results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // match strength is relative to the best candidate (presentation, not probability)
  const top = results[0]?.score || 1;
  for (const r of results) r.matchPct = Math.round(99 * (r.score / top));
  return results.slice(0, limit);
}
