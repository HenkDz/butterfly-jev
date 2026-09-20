import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDecision } from '../.test-build/server/decision.js';
import { createWorld, inputFor } from '../.test-build/src/sim/model.js';
const input = inputFor(createWorld(), createWorld().agents[0]);
const request = (body = input, headers = {}) => new Request('https://butterfly.test/api/decide', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const reply = (changes = {}) => ({ model: 'jev-test', answers: { next_action: { choice: 'continue_work', confidence: .8, probabilities: Object.fromEntries(input.allowedActions.map(a => [a, a === 'continue_work' ? 1 : 0])), ...changes } }, usage: { input_tokens: 231 } });
test('missing key is explicit, not a fake model response', async () => { assert.equal((await handleDecision(request(), {})).status, 503); });
test('kill switch prevents any upstream call', async () => { let calls = 0; const r = await handleDecision(request(), { key: 'test', enabled: false, fetcher: async () => { calls++; } }); assert.equal(r.status, 503); assert.equal(calls, 0); });
test('invalid JSON is a bounded 400', async () => {
  const req = new Request('https://butterfly.test/api/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal((await handleDecision(req, { key: 'test' })).status, 400);
});
test('wrong methods, content types and origins are rejected', async () => {
  assert.equal((await handleDecision(new Request('https://butterfly.test/api/decide'), {})).status, 405);
  assert.equal((await handleDecision(request(input, { origin: 'https://elsewhere.test' }), { key: 'test' })).status, 403);
  assert.equal((await handleDecision(request(input, { 'content-type': 'text/plain' }), { key: 'test' })).status, 415);
});
test('oversized payloads and unbounded memories are rejected', async () => {
  assert.equal((await handleDecision(request({ ...input, situation: 'x'.repeat(17000) }), { key: 'test' })).status, 413);
  assert.equal((await handleDecision(request({ ...input, memories: Array(9).fill('memory') }), { key: 'test' })).status, 400);
});
test('arbitrary and duplicate action options are rejected', async () => {
  assert.equal((await handleDecision(request({ ...input, allowedActions: ['steal_key', 'wait'] }), { key: 'test' })).status, 400);
  assert.equal((await handleDecision(request({ ...input, allowedActions: ['wait', 'wait'] }), { key: 'test' })).status, 400);
});
test('official typed-choice request and valid response round trip', async () => {
  let captured;
  const r = await handleDecision(request(), { key: 'secret-sentinel', fetcher: async (url, options) => { captured = { url, ...options, body: JSON.parse(options.body) }; return Response.json(reply()); } });
  assert.equal(r.status, 200); const d = await r.json(); assert.equal(d.source, 'jev'); assert.equal(d.action, 'continue_work'); assert.equal(d.inputTokens, 231);
  assert.equal(captured.url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(captured.body.questions.next_action.type, 'choice'); assert.ok(!JSON.stringify(d).includes('secret-sentinel'));
});
test('invalid upstream actions and probabilities are not silently normalized', async () => {
  for (const changes of [{ choice: 'teleport' }, { probabilities: {} }, { confidence: 2 }, { probabilities: { ...reply().answers.next_action.probabilities, wait: 2 } }]) {
    const r = await handleDecision(request(), { key: 'test', fetcher: async () => Response.json(reply(changes)) }); assert.equal(r.status, 502);
  }
});
test('upstream 429 and failures stay explicit and never return rules', async () => {
  for (const status of [429, 401, 500]) { const r = await handleDecision(request(), { key: 'test', fetcher: async () => new Response('private upstream body', { status }) }); assert.equal(r.status, status === 429 ? 429 : 502); assert.ok(!(await r.text()).includes('private upstream body')); }
});
test('network timeouts do not expose the key', async () => {
  const r = await handleDecision(request(), { key: 'secret-sentinel', fetcher: async () => { throw new DOMException('failed secret-sentinel', 'TimeoutError'); } });
  assert.equal(r.status, 502); const message = await r.text(); assert.ok(message.includes('timed out')); assert.ok(!message.includes('secret-sentinel'));
});
