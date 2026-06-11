import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, addFollow } from './store.js';
import { recommend, traversalScores, buildAdjacency, DECAY } from './engine.js';

test('recommendations exclude self and already-followed users', () => {
  const store = createStore();
  const recs = recommend(store, 'you');
  const ids = recs.map((r) => r.id);
  assert.ok(!ids.includes('you'));
  assert.ok(!ids.includes('diego'));   // already followed
  assert.ok(!ids.includes('lucas'));   // already followed
});

test('flavia tops recommendations for the demo user', () => {
  const store = createStore();
  const recs = recommend(store, 'you');
  assert.ok(recs.length > 0);
  assert.equal(recs[0].id, 'flavia');
  assert.ok(recs[0].matchPct > recs.at(-1).matchPct);
});

test('reasons carry shared interests and mutual connections', () => {
  const store = createStore();
  const flavia = recommend(store, 'you').find((r) => r.id === 'flavia');
  assert.ok(flavia.reasons.sharedInterests.includes('transport'));
  assert.ok(flavia.reasons.mutualConnections >= 1);
  assert.equal(flavia.reasons.sameCity, true);
});

test('BFS decay: nearer nodes outscore distant ones on a uniform chain', () => {
  const mk = (id) => ({ id, name: id, role: '', city: '', interests: ['x'], active: ['am'] });
  const store = createStore({
    users: [mk('a'), mk('b'), mk('c'), mk('d')],
    follows: { a: ['b'], b: ['c'], c: ['d'], d: [] },
    interactions: [],
  });
  const scores = traversalScores(store, buildAdjacency(store), 'a');
  assert.ok(scores.get('c') > scores.get('d'), 'depth-2 node should outscore depth-3 node');
});

test('decay constant shapes contributions', () => {
  assert.ok(DECAY > 0 && DECAY < 1);
});

test('following a user removes them and reshuffles the ranking', () => {
  const store = createStore();
  const before = recommend(store, 'you').map((r) => r.id);
  assert.ok(before.includes('flavia'));
  addFollow(store, 'you', 'flavia');
  const after = recommend(store, 'you').map((r) => r.id);
  assert.ok(!after.includes('flavia'));
});

test('recommend returns null for unknown users', () => {
  const store = createStore();
  assert.equal(recommend(store, 'ghost'), null);
});
