import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext, Transient, transientReason } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { LIMITS } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { isAllowedUrl, isPrivateHost } from '../../skills/ax-kit/scripts/lib/net/host-policy.mjs';
import { createLimiter } from '../../skills/ax-kit/scripts/lib/net/limiter.mjs';
import { startSite, text } from '../fixtures/server.mjs';

const withSite = async (routes, run) => {
  const site = await startSite(routes);
  try {
    await run(site, createContext({ target: site.origin, profile: 'content' }));
  } finally {
    await site.close();
  }
};

test('private hosts are recognised', () => {
  const hosts = ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '172.31.9.9', '[::1]', 'app.local'];
  assert.deepEqual(hosts.map(isPrivateHost), hosts.map(() => true));
  assert.deepEqual(['example.com', '172.32.0.1', '8.8.8.8', '11.0.0.1'].map(isPrivateHost), [false, false, false, false]);
});

test('a public target cannot reach a private host, and a private target can', () => {
  assert.equal(isAllowedUrl('https://example.com/', 'http://127.0.0.1/admin'), false);
  assert.equal(isAllowedUrl('https://example.com/', 'https://cdn.example.net/x'), true);
  assert.equal(isAllowedUrl('http://localhost:3000/', 'http://127.0.0.1:3000/x'), true);
  assert.equal(isAllowedUrl('https://example.com/', 'file:///etc/passwd'), false);
});

test('one request reaches the server for each distinct request', async () => {
  await withSite({ '/a': text('a') }, async (site, ctx) => {
    await Promise.all([ctx.fetch('/a'), ctx.fetch('/a'), ctx.fetch(`${site.origin}/a`)]);
    await ctx.fetch('/a', { headers: { Accept: 'text/markdown' } });
    assert.equal(site.hitsFor('/a').length, 2);
  });
});

test('a snapshot carries the status, lower-case headers, and the body', async () => {
  await withSite({ '/a': text('hello', { 'X-Demo': '1' }) }, async (site, ctx) => {
    const snapshot = await ctx.fetch('/a');
    assert.deepEqual(
      [snapshot.status, snapshot.headers['x-demo'], snapshot.body, snapshot.error, snapshot.method],
      [200, '1', 'hello', null, 'GET'],
    );
  });
});

test('redirects are followed and recorded', async () => {
  const routes = { '/old': { status: 301, headers: { location: '/new' } }, '/new': text('moved') };
  await withSite(routes, async (site, ctx) => {
    const snapshot = await ctx.fetch('/old');
    assert.equal(snapshot.body, 'moved');
    assert.deepEqual(snapshot.redirects, [`${site.origin}/new`]);
    assert.equal(snapshot.finalUrl, `${site.origin}/new`);
  });
});

test('a redirect loop stops with an error', async () => {
  await withSite({ '/loop': { status: 302, headers: { location: '/loop' } } }, async (site, ctx) => {
    const snapshot = await ctx.fetch('/loop');
    assert.equal(snapshot.error, 'too_many_redirects');
    assert.equal(site.hitsFor('/loop').length, LIMITS.redirects + 1);
  });
});

test('a body over the limit is cut and marked as truncated', async () => {
  await withSite({ '/big': text('x'.repeat(LIMITS.bodyBytes + 10)) }, async (site, ctx) => {
    const snapshot = await ctx.fetch('/big');
    assert.equal(snapshot.truncated, true);
    assert.ok(snapshot.body.length <= LIMITS.bodyBytes);
  });
});

test('a connection failure becomes a network error, not an exception', async () => {
  const ctx = createContext({ target: 'http://127.0.0.1:9', profile: 'content' });
  const snapshot = await ctx.fetch('/');
  assert.equal(snapshot.error, 'network');
  assert.equal(snapshot.status, 0);
});

test('get throws a transient error for 5xx and 429, and returns other statuses', async () => {
  const routes = { '/500': { status: 503 }, '/429': { status: 429 }, '/404': { status: 404 } };
  await withSite(routes, async (site, ctx) => {
    await assert.rejects(ctx.get('/500'), (error) => error instanceof Transient && error.reason === 'server_error');
    await assert.rejects(ctx.get('/429'), (error) => error instanceof Transient && error.reason === 'rate_limited');
    assert.equal((await ctx.get('/404')).status, 404);
  });
});

test('transient reasons cover network errors only', () => {
  const reasonOf = (snapshot) => transientReason({ status: 0, error: null, ...snapshot });
  assert.equal(reasonOf({ error: 'timeout' }), 'timeout');
  assert.equal(reasonOf({ error: 'budget' }), 'deadline');
  assert.equal(reasonOf({ error: 'blocked_url' }), null);
  assert.equal(reasonOf({ status: 499 }), null);
  assert.equal(reasonOf({ status: 500 }), 'server_error');
});

test('the limiter never runs more tasks than the concurrency limit', async () => {
  const limiter = createLimiter({ concurrency: 2, requests: 10, posts: 1, deadlineMs: 1000 });
  let active = 0;
  let peak = 0;
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  };
  await Promise.all(Array.from({ length: 6 }, () => limiter.run('GET', task)));
  assert.equal(peak, 2);
  assert.deepEqual(limiter.stats(), { made: 6, budget: 10 });
});

test('the limiter refuses requests over the budget, a second POST, and work after the deadline', async () => {
  const budget = createLimiter({ concurrency: 1, requests: 2, posts: 1, deadlineMs: 1000 });
  const outcomes = [];
  for (const method of ['POST', 'POST', 'GET', 'GET']) outcomes.push(await budget.run(method, async () => 'ok'));
  assert.deepEqual(outcomes, [{ value: 'ok' }, { refused: 'budget' }, { value: 'ok' }, { refused: 'budget' }]);

  let clock = 0;
  const late = createLimiter({ concurrency: 1, requests: 5, posts: 1, deadlineMs: 100, now: () => clock });
  clock = 101;
  assert.deepEqual(await late.run('GET', async () => 'ok'), { refused: 'deadline' });
});

test('a refused request becomes a snapshot with a transient reason', async () => {
  await withSite({ '/a': text('a') }, async (site) => {
    const limiter = createLimiter({ concurrency: 1, requests: 0, posts: 0, deadlineMs: 1000 });
    const ctx = createContext({ target: site.origin, profile: 'content', limiter });
    const snapshot = await ctx.fetch('/a');
    assert.equal(snapshot.error, 'budget');
    assert.equal(site.hits.length, 0);
  });
});

test('a method outside the allowed set is refused before any request', async () => {
  await withSite({ '/a': text('a') }, async (site, ctx) => {
    const snapshot = await ctx.fetch('/a', { method: 'DELETE' });
    assert.equal(snapshot.error, 'method_not_allowed');
    assert.equal(site.hits.length, 0);
  });
});

test('a redirect is not followed for a POST, so the request is sent one time', async () => {
  const routes = { 'POST /old': { status: 307, headers: { location: '/new' } }, 'POST /new': text('moved') };
  await withSite(routes, async (site, ctx) => {
    const snapshot = await ctx.fetch('/old', { method: 'POST', body: '{}' });
    assert.deepEqual([snapshot.status, snapshot.redirects], [307, []]);
    assert.deepEqual(site.hits.map((hit) => `${hit.method} ${hit.path}`), ['POST /old']);
  });
});
