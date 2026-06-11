# NODAL

Landing site for NODAL — Nodos Urbanos de América Latina — plus a zero-dependency
recommendation API.

## Static site

`index.html`, `payments.html`, `profile.html`, `dashboard.html` work on any
static host. With no backend the match deck shows the authored demo card.

The landing page has an EN / ES / PT switcher in the navbar (`i18n.js`):
English lives in the markup, Spanish and Portuguese in the dictionary, and the
choice persists in `localStorage`. Typography is Montserrat only.

## Recommendation API

```sh
npm start            # node server/server.js — serves the site + API on :4173
PORT=8080 npm start  # custom port
REDIS_URL=redis://localhost:6379 npm start   # use Redis for the 5-min cache
```

Without `REDIS_URL` an in-memory TTL cache with identical semantics is used.

| Endpoint | Description |
| --- | --- |
| `GET /api/recommendations/:userId` | Ranked profiles — weighted graph traversal (BFS, decay 0.5/hop) + collaborative filtering. Cached 5 min (`X-Cache: HIT/MISS`). |
| `POST /api/users/:userId/follow` | `{ "targetId": "..." }` — adds an edge, invalidates both users' caches. |
| `POST /api/users/:userId/interactions` | `{ "targetId": "...", "type": "view\|like\|skip\|message" }` — records engagement, invalidates caches. |
| `GET /api/users` | Public profile list. |
| `GET /api/health` | Liveness probe. |

Edge weights blend shared interests (0.35), mutual connections (0.25),
engagement history (0.25) and activity overlap (0.15).

## Tests

```sh
npm test             # node --test server/*.test.js
```
