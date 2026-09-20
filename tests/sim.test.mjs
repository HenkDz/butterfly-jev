import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, fork, pending, inputFor, advance, rulesDecision, stepRules, knowledge, route, neighbors, differences, causalChain, MAX_TICKS } from '../.test-build/src/sim/model.js';
const plan = (w, id, action) => ({ id, input: inputFor(w, w.agents[id]), decision: { action, source: 'rules', probabilities: {} } });
test('24 unique residents; only Mina knows the initial rumor', () => {
  const w = createWorld(); assert.equal(w.agents.length, 24); assert.equal(new Set(w.agents.map(a => a.name)).size, 24);
  assert.deepEqual(w.agents.filter(a => knowledge(a) !== 'unaware').map(a => a.id), [0]);
});
test('fork changes only the selected memory and its invalidation revision', () => {
  const w = createWorld(), original = structuredClone(w), b = fork(w, 0, 'distrust');
  assert.deepEqual(w, original); assert.deepEqual(w.agents.slice(1), b.agents.slice(1));
  const { memory, revision, ...after } = b.agents[0], { memory: oldMemory, revision: oldRevision, ...before } = w.agents[0];
  assert.deepEqual(after, before); assert.equal(memory.length, oldMemory.length); assert.equal(revision, oldRevision + 1);
  assert.deepEqual(memory.find(m => m.kind === 'rumor'), oldMemory.find(m => m.kind === 'rumor'));
  assert.equal(b.bridgeClosed, w.bridgeClosed); assert.equal(b.tick, w.tick);
});
test('no-op control worlds stay identical for the entire experiment', () => {
  let a = createWorld(), b = structuredClone(a);
  for (let i = 0; i < MAX_TICKS; i++) { a = stepRules(a); b = stepRules(b); assert.deepEqual(a, b); }
});
test('physical movement only traverses real graph edges', () => {
  let w = createWorld();
  for (let i = 0; i < 80; i++) { const n = stepRules(w); for (const a of n.agents) assert.ok(a.node === w.agents[a.id].node || neighbors(w.agents[a.id].node).includes(a.node)); w = n; }
});
test('detour cannot cross the northern bridge; it uses the southern route', () => {
  const p = route(2, 3, true); assert.ok(p.includes(20) && p.includes(21)); assert.notDeepEqual(p, [2, 3]);
});
test('inspection requires reaching the bridge, not instant knowledge', () => {
  const w = createWorld(); const n = advance(w, [plan(w, 0, 'inspect_bridge')]);
  assert.notEqual(n.agents[0].node, 2); assert.equal(n.agents[0].memory.some(m => m.kind === 'observation'), false);
  const after = advance(n, []); assert.equal(after.agents[0].node, 2); assert.equal(knowledge(after.agents[0]), 'informed');
});
test('warning reaches a physically local person and no other private memory', () => {
  const w = createWorld(), n = advance(w, [plan(w, 0, 'share_warning')]);
  const e = n.events.find(e => e.kind === 'warning'); assert.ok(e); assert.notEqual(e.target, 0);
  assert.equal(knowledge(n.agents[e.target]), 'concerned');
  for (const a of w.agents) if (a.id !== e.target) assert.deepEqual(a.memory, n.agents[a.id].memory);
});
test('decision input cannot see anyone else’s private memory or objective bridge status', () => {
  const w = createWorld(); w.agents[1].memory.push({ text: 'PRIVATE_SENTINEL', kind: 'trust', source: 'secret' });
  const before = inputFor(w, w.agents[0]); w.bridgeClosed = true; const after = inputFor(w, w.agents[0]);
  assert.deepEqual(before, after); assert.ok(!JSON.stringify(before).includes('PRIVATE_SENTINEL'));
});
test('stale decisions and impossible evidence sharing are rejected without mutation', () => {
  const w = createWorld(), original = structuredClone(w), p = plan(w, 0, 'continue_work'); p.input.situation = 'outdated';
  assert.throws(() => advance(w, [p]), /Stale/); assert.throws(() => advance(w, [plan(w, 0, 'share_evidence')]), /not permitted/); assert.deepEqual(w, original);
});
test('repeated hearsay does not erase first-hand evidence', () => {
  let w = fork(createWorld(), 1, 'evidence'); w.agents[1].node = w.agents[0].node;
  w = advance(w, [plan(w, 0, 'share_warning')]); assert.equal(knowledge(w.agents[1]), 'informed');
});
test('a memory fork yields action and downstream differences, without changing seed or physical facts', () => {
  let a = createWorld(), b = fork(a, 0, 'distrust');
  assert.notEqual(rulesDecision(a, a.agents[0]).action, rulesDecision(b, b.agents[0]).action);
  for (let i = 0; i < 15; i++) { a = stepRules(a); b = stepRules(b); }
  assert.ok(differences(a, b).some(id => id !== 0)); assert.equal(a.seed, b.seed); assert.equal(a.bridgeClosed, b.bridgeClosed); assert.equal(a.tick, b.tick);
});
test('evidence interventions remain private until communicated', () => {
  const w = createWorld(), b = fork(w, 7, 'evidence');
  assert.equal(knowledge(b.agents[7]), 'informed'); assert.deepEqual(w.agents.filter(a => a.id !== 7), b.agents.filter(a => a.id !== 7));
});
test('forgetting a rumor does not wipe other memories', () => {
  const w = createWorld(), b = fork(w, 0, 'forget'); assert.equal(knowledge(b.agents[0]), 'unaware');
  assert.deepEqual(b.agents[0].memory, w.agents[0].memory.filter(m => m.kind !== 'rumor'));
});
test('causal ancestry reaches the private intervention and recorded input', () => {
  let b = fork(createWorld(), 0, 'distrust'); b = stepRules(b); b = advance(b, []);
  const observation = b.events.find(e => e.kind === 'observation'); assert.ok(observation);
  const chain = causalChain(b, observation.id); assert.ok(chain.some(e => e.kind === 'decision' && e.input)); assert.ok(chain.some(e => e.kind === 'intervention'));
});
test('every referenced causal parent exists and memories stay bounded', () => {
  let w = createWorld(); for (let i = 0; i < MAX_TICKS; i++) w = stepRules(w);
  const ids = new Set(w.events.map(e => e.id)); for (const e of w.events) for (const parent of e.parents) assert.ok(ids.has(parent));
  assert.ok(w.agents.every(a => a.memory.length <= 4)); assert.equal(w.tick, MAX_TICKS); assert.deepEqual(stepRules(w), w);
});
