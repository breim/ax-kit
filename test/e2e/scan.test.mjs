import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { LIMITS } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { scan } from '../../skills/ax-kit/scripts/lib/scan/scan.mjs';
import { startSite } from '../fixtures/server.mjs';
import { badContentSite, blockedSite, goodContentSite, softNotFound, unstableContentSite } from '../fixtures/sites.mjs';

const CLI = fileURLToPath(new URL('../../skills/ax-kit/scripts/ax.mjs', import.meta.url));
const ALLOWED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST'];

async function withSite(routes, run, options) {
  const site = await startSite(routes, options);
  try {
    return await run(site);
  } finally {
    await site.close();
  }
}

const scanSite = (routes, profile = 'content', options) =>
  withSite(routes, async (site) => ({ report: await scan({ target: site.origin, profile }), site }), options);

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the good site scores above the bad site, and the good site has no cap', async () => {
  const good = (await scanSite(goodContentSite)).report;
  const bad = (await scanSite(badContentSite, 'content', { notFound: softNotFound })).report;
  assert.ok(good.score > bad.score, `good ${good.score} must be above bad ${bad.score}`);
  assert.equal(good.cap, null);
  assert.equal(good.coverage.percent, 100);
  assert.deepEqual(good.coverage.notAssessed, []);
});

test('two scans of one site give the same report', async () => {
  await withSite(goodContentSite, async (site) => {
    const first = JSON.stringify(await scan({ target: site.origin, profile: 'content' }));
    const second = JSON.stringify(await scan({ target: site.origin, profile: 'content' }));
    assert.equal(first, second);
  });
});

test('the scanner sends only read-only methods, one POST at most, and stays in the request budget', async () => {
  for (const profile of ['content', 'api', 'webapp', 'commerce']) {
    const { report, site } = await scanSite(goodContentSite, profile);
    const methods = site.hits.map((hit) => hit.method);
    assert.deepEqual(methods.filter((method) => !ALLOWED_METHODS.includes(method)), [], profile);
    assert.ok(methods.filter((method) => method === 'POST').length <= LIMITS.posts, profile);
    assert.ok(site.hits.length <= LIMITS.requests, `${profile}: ${site.hits.length} requests`);
    assert.equal(report.requests.made, site.hits.length);
  }
});

test('each request identifies the scanner', async () => {
  const { site } = await scanSite(goodContentSite);
  const anonymous = site.hits.filter((hit) => !hit.headers['user-agent'].endsWith('ax-kit/0.1.0'));
  assert.deepEqual(anonymous, []);
  assert.ok(site.hits.some((hit) => hit.headers['user-agent'] === 'ax-kit/0.1.0'));
});

test('a blocked site is capped at 59 with grade F', async () => {
  const { report } = await scanSite(blockedSite);
  assert.ok(report.score <= 59);
  assert.equal(report.grade, 'F');
  assert.deepEqual(report.cap.by, ['reach.plain-fetch']);
});

test('an unreachable site has no score', async () => {
  const report = await scan({ target: 'http://127.0.0.1:9', profile: 'content' });
  assert.deepEqual([report.score, report.upperBound, report.grade], [null, null, null]);
});

test('a server error on one resource lowers the coverage and not the upper bound', async () => {
  const stable = (await scanSite(goodContentSite)).report;
  const unstable = (await scanSite(unstableContentSite)).report;
  assert.ok(unstable.score < stable.score);
  assert.equal(unstable.upperBound, stable.upperBound);
  assert.ok(unstable.coverage.percent < 100);
  assert.deepEqual(unstable.coverage.notAssessed, ['discover.llms-txt', 'discover.llms-txt-quality']);
});

test('a detected profile is reported with its signals', async () => {
  await withSite(goodContentSite, async (site) => {
    const report = await scan({ target: site.origin });
    assert.deepEqual([report.profile.value, report.profile.source], ['content', 'detected']);
    assert.ok(report.profile.signals.length > 0);
  });
});

test('the CLI prints JSON and exits 0 without a gate', async () => {
  await withSite(goodContentSite, async (site) => {
    const { code, stdout } = await runCli(['scan', site.origin, '--profile', 'content', '--json']);
    const report = JSON.parse(stdout);
    assert.equal(code, 0);
    assert.equal(report.schema, 'ax.scan/1');
    assert.equal(report.gate, null);
  });
});

test('the CLI gate exits 0, 1, or 3 from the score and the upper bound', async () => {
  await withSite(unstableContentSite, async (site) => {
    const { score, upperBound } = await scan({ target: site.origin, profile: 'content' });
    const exitFor = async (minimum) => (await runCli(['scan', site.origin, '--profile', 'content', '--min-score', String(minimum)])).code;
    assert.ok(upperBound > score);
    assert.deepEqual(
      [await exitFor(score), await exitFor(score + 1), await exitFor(upperBound), await exitFor(upperBound + 1)],
      [0, 3, 3, 1],
    );
  });
});

test('the CLI exits 4 for an unreachable site and 2 for a usage error', async () => {
  assert.equal((await runCli(['scan', 'http://127.0.0.1:9', '--profile', 'content'])).code, 4);
  const usage = await runCli(['scan']);
  assert.equal(usage.code, 2);
  assert.match(usage.stderr, /scan needs a URL/);
  assert.equal(usage.stdout, '');
});

test('the CLI text report shows the score, the pillars, and the gaps', async () => {
  await withSite(badContentSite, async (site) => {
    const { stdout } = await runCli(['scan', site.origin, '--profile', 'content']);
    assert.match(stdout, /^AX Score {2}\d+ \/ 100/);
    assert.match(stdout, /Pillars {3}Reach/);
    assert.match(stdout, /discover\.llms-txt {2}\[references\/llms-txt\.md\]/);
  });
});
