import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { challengeSignal } from '../../skills/ax-kit/scripts/lib/net/challenge.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn } from '../fixtures/run-check.mjs';
import { json } from '../fixtures/server.mjs';

const GATE = 'reach.plain-fetch';
const page = (status, headers = {}, body = '<html><body>Hello</body></html>') => ({
  '/': { status, headers: { 'content-type': 'text/html', ...headers }, body },
});
const api = (status, headers = {}) => ({ '/': { ...json({ error: 'x' }), status, headers: { 'content-type': 'application/json', ...headers } } });

const outcome = async (routes, profile = 'content') => {
  const { result } = await runCheckOn(routes, GATE, { profile });
  return result.reason ? `${result.status}:${result.reason}` : result.status;
};

test('the gate passes for a normal page', async () => {
  assert.equal(await outcome(page(200)), 'pass');
});

test('the gate fails for 403 and 429 with an HTML body', async () => {
  assert.equal(await outcome(page(403)), 'fail');
  assert.equal(await outcome(page(429)), 'fail');
});

test('the gate fails for a challenge header on any status', async () => {
  assert.equal(await outcome(page(200, { 'cf-mitigated': 'challenge' })), 'fail');
  assert.equal(await outcome(page(403, { 'x-vercel-mitigated': 'challenge' })), 'fail');
});

test('the gate fails for a challenge page with a 503 status', async () => {
  assert.equal(await outcome(page(503, {}, '<html><head><title>Just a moment...</title></head></html>')), 'fail');
});

test('a vendor string in a normal page is not a challenge', async () => {
  assert.equal(await outcome(page(200, {}, '<html><script src="/px-captcha.js"></script>Welcome</html>')), 'pass');
});

test('the gate has no result for a server error or a rate limit with no HTML body', async () => {
  assert.equal(await outcome(page(503)), 'not_assessed:server_error');
  assert.equal(await outcome(api(429)), 'not_assessed:rate_limited');
});

test('the gate has no result when a page profile gets a missing entry page', async () => {
  assert.equal(await outcome(page(404)), 'not_assessed:entry_status');
});

test('an API that asks for credentials or has no root route is reachable', async () => {
  assert.equal(await outcome(api(401, { 'www-authenticate': 'Bearer' }), 'api'), 'pass');
  assert.equal(await outcome(api(403), 'api'), 'pass');
  assert.equal(await outcome(api(404), 'api'), 'pass');
});

test('an HTML block page fails for an API too', async () => {
  assert.equal(await outcome(page(403), 'api'), 'fail');
});

test('the gate has no result when the host does not answer', async () => {
  const ctx = createContext({ target: 'http://127.0.0.1:9', profile: 'content' });
  const [result] = await runChecks([CHECKS.find((check) => check.id === GATE)], ctx);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'network']);
});

const snapshot = (overrides) => ({ status: 200, headers: {}, body: '', ...overrides });

test('challenge signals name the vendor', () => {
  assert.equal(challengeSignal(snapshot({ headers: { 'cf-mitigated': 'challenge' } }), true), 'Cloudflare challenge');
  assert.equal(challengeSignal(snapshot({ status: 403, body: 'see captcha-delivery.com' }), false), 'DataDome challenge');
  assert.equal(challengeSignal(snapshot({ status: 403 }), true), 'HTTP 403 with an HTML body');
  assert.equal(challengeSignal(snapshot({ status: 403 }), false), null);
  assert.equal(challengeSignal(snapshot({ status: 399, body: 'captcha-delivery.com' }), true), null);
  assert.equal(challengeSignal(snapshot({ status: 400, body: 'captcha-delivery.com' }), false), 'DataDome challenge');
});

test('the gate is the only gate in the reach pillar', () => {
  assert.deepEqual(CHECKS.filter((check) => check.gate && check.id.startsWith('reach.')).map((check) => check.id), [GATE]);
});
