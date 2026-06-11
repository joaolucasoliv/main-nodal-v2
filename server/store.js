/* in-memory user graph: nodes are members, edges are follows + engagement.
   The store is the single mutable surface — the engine only reads it. */

const ENGAGEMENT_WEIGHT = { view: 1, skip: 0.5, like: 3, message: 4, follow: 3 };

export function seedData() {
  /* personas mirror the ones on the site; `you` is the demo session user
     the landing page requests recommendations for */
  const users = [
    { id: 'you',     name: 'You',          role: 'Civic Designer',             city: 'Lima',       interests: ['transport', 'community engagement', 'public policy', 'research'], active: ['am', 'eve'] },
    { id: 'flavia',  name: 'Flavia Muro',  role: 'Urban Mobility Researcher',  city: 'Lima',       interests: ['transport', 'research', 'public policy', 'community engagement'], active: ['am', 'eve'] },
    { id: 'diego',   name: 'Diego A.',     role: 'Mobility Engineer',          city: 'Lima',       interests: ['transport', 'engineering', 'data'],                                active: ['am', 'pm'] },
    { id: 'sofia',   name: 'Sofía M.',     role: 'City Planner',               city: 'CDMX',       interests: ['planning', 'housing', 'public policy'],                            active: ['am', 'pm'] },
    { id: 'lucas',   name: 'Lucas O.',     role: 'Civic Technologist',         city: 'São Paulo',  interests: ['data', 'civic tech', 'community engagement'],                      active: ['pm', 'eve'] },
    { id: 'valeria', name: 'Valeria C.',   role: 'Urban Economist',            city: 'Santiago',   interests: ['economics', 'public policy', 'data'],                              active: ['am', 'eve'] },
    { id: 'mariana', name: 'Mariana R.',   role: 'Urban Researcher',           city: 'Bogotá',     interests: ['research', 'housing', 'community engagement'],                     active: ['am', 'pm'] },
    { id: 'camila',  name: 'Camila T.',    role: 'Community Leader',           city: 'Bogotá',     interests: ['community engagement', 'housing'],                                 active: ['eve'] },
    { id: 'rafael',  name: 'Rafael S.',    role: 'Civil Engineer',             city: 'São Paulo',  interests: ['engineering', 'construction'],                                     active: ['am', 'pm'] },
    { id: 'ines',    name: 'Inés D.',      role: 'Architect',                  city: 'Montevideo', interests: ['design', 'housing', 'planning'],                                   active: ['pm'] },
    { id: 'tomas',   name: 'Tomás V.',     role: 'Transport Engineer',         city: 'Santiago',   interests: ['transport', 'engineering', 'data'],                                active: ['am', 'pm'] },
    { id: 'paula',   name: 'Paula N.',     role: 'Anthropologist',             city: 'CDMX',       interests: ['research', 'community engagement'],                                active: ['pm', 'eve'] },
  ];

  const follows = {
    you:     ['diego', 'lucas'],
    flavia:  ['diego', 'mariana', 'camila', 'valeria'],
    diego:   ['flavia', 'tomas', 'rafael'],
    sofia:   ['ines', 'paula', 'mariana'],
    lucas:   ['rafael', 'camila', 'valeria'],
    valeria: ['tomas', 'sofia'],
    mariana: ['camila', 'sofia'],
    camila:  ['mariana', 'lucas'],
    rafael:  ['diego', 'tomas'],
    ines:    ['sofia'],
    tomas:   ['diego', 'valeria'],
    paula:   ['sofia', 'mariana'],
  };

  const interactions = [
    { from: 'you',    to: 'flavia',  type: 'view' },
    { from: 'you',    to: 'flavia',  type: 'like' },
    { from: 'you',    to: 'valeria', type: 'view' },
    { from: 'diego',  to: 'flavia',  type: 'message' },
    { from: 'lucas',  to: 'camila',  type: 'message' },
    { from: 'flavia', to: 'mariana', type: 'like' },
  ];

  return { users, follows, interactions };
}

export function createStore(seed = seedData()) {
  const store = {
    users: new Map(seed.users.map((u) => [u.id, u])),
    follows: new Map(seed.users.map((u) => [u.id, new Set(seed.follows[u.id] ?? [])])),
    engagement: new Map(),
  };
  for (const { from, to, type } of seed.interactions) recordInteraction(store, from, to, type);
  return store;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function recordInteraction(store, from, to, type) {
  const w = ENGAGEMENT_WEIGHT[type];
  if (w === undefined) throw new Error(`unknown interaction type: ${type}`);
  const k = pairKey(from, to);
  store.engagement.set(k, (store.engagement.get(k) ?? 0) + w);
}

export function getEngagement(store, a, b) {
  return store.engagement.get(pairKey(a, b)) ?? 0;
}

export function addFollow(store, from, to) {
  const set = store.follows.get(from);
  if (!set) throw new Error(`unknown user: ${from}`);
  if (!store.follows.has(to)) throw new Error(`unknown user: ${to}`);
  const isNew = !set.has(to);
  set.add(to);
  if (isNew) recordInteraction(store, from, to, 'follow');
  return isNew;
}
