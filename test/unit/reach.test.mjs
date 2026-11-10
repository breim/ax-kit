import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TRAINING_CRAWLERS, USER_DIRECTED_AGENTS } from '../../skills/ax-kit/scripts/lib/context/ai-agents.mjs';
import { CONTENT_SIGNAL, CONTENT_USAGE, formatPreferences, parsePreference } from '../../skills/ax-kit/scripts/lib/context/content-preferences.mjs';
import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { USER_AGENT } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { challengeSignal } from '../../skills/ax-kit/scripts/lib/net/challenge.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';
import { softNotFound } from '../fixtures/sites.mjs';

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

const ROBOTS = 'reach.robots-txt';
const ALLOWED = 'reach.user-agents-allowed';
const POLICY = 'reach.bot-policy-explicit';
const SIGNALS = 'reach.content-signals';
const AIPREF = 'reach.aipref';
const TRAINING = 'reach.training-crawler-policy';
const BRANDED = 'reach.branded-agent-fetch';
const VERIFIED = 'reach.verified-agents';

const OPEN = 'User-agent: *\nAllow: /\n';
const CLOSED = 'User-agent: *\nDisallow: /\n';
const HOME = { '/': html('<html><body>Home</body></html>') };
const robots = (body) => ({ '/robots.txt': text(body) });
const resultOf = async (routes, checkId, options) => (await runCheckOn(routes, checkId, options)).result;

async function resultOnPath(routes, checkId, path) {
  const site = await startSite(routes);
  try {
    const ctx = createContext({ target: `${site.origin}${path}`, profile: 'content' });
    const [result] = await runChecks([CHECKS.find((check) => check.id === checkId)], ctx);
    return result;
  } finally {
    await site.close();
  }
}

test('robots.txt passes when it is a text file with a User-agent group', async () => {
  assert.equal(await statusOf(robots(OPEN), ROBOTS), 'pass');
  assert.equal(await statusOf(robots('# rules\nuser-agent: GPTBot\ndisallow: /'), ROBOTS), 'pass');
});

test('robots.txt is partial when the server sends the rules as HTML', async () => {
  assert.equal(await statusOf({ '/robots.txt': html(OPEN) }, ROBOTS), 'partial');
});

test('robots.txt fails when it is missing, a soft 404, or has no User-agent group', async () => {
  const missing = await resultOf({}, ROBOTS);
  assert.deepEqual([missing.status, missing.summary], ['fail', 'No robots.txt file is at the site root.']);
  const soft = await resultOf({}, ROBOTS, { notFound: softNotFound });
  assert.deepEqual([soft.status, soft.summary], ['fail', 'The robots.txt path returns an HTML page and not a robots.txt file.']);
  const empty = await resultOf(robots('Sitemap: /sitemap.xml\n'), ROBOTS);
  assert.deepEqual([empty.status, empty.summary], ['fail', 'The robots.txt file has no User-agent group.']);
});

test('robots.txt is not applicable to an API and has no result on a server error', async () => {
  assert.equal(await statusOf(robots(OPEN), ROBOTS, { profile: 'api' }), 'not_applicable');
  const result = await resultOf({ '/robots.txt': { status: 503 } }, ROBOTS);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

test('user-directed agents pass with an open file, with no file, and with a file that has no rules', async () => {
  assert.equal(await statusOf(robots(OPEN), ALLOWED), 'pass');
  const missing = await resultOf({}, ALLOWED);
  assert.deepEqual([missing.status, missing.summary], ['pass', 'No robots.txt rule restricts user-directed agents.']);
  assert.equal(await statusOf(robots('<<< this is not a robots file >>>'), ALLOWED), 'pass');
});

test('a block on AI training crawlers does not change the result for user-directed agents', async () => {
  const groups = TRAINING_CRAWLERS.map((token) => `User-agent: ${token}`).join('\n');
  assert.equal(await statusOf(robots(`${groups}\nDisallow: /\n\n${OPEN}`), ALLOWED), 'pass');
});

test('user-directed agents are partial when robots.txt blocks one subject or three subjects', async () => {
  const one = await resultOf(robots('User-agent: ChatGPT-User\nDisallow: /\n'), ALLOWED);
  assert.deepEqual([one.status, one.summary], ['partial', 'robots.txt blocks these agents on the entry path: ChatGPT-User.']);
  const three = await resultOf(robots(`${CLOSED}\nUser-agent: Claude-User\nAllow: /\n`), ALLOWED);
  assert.equal(three.status, 'partial');
  assert.match(three.summary, /: ChatGPT-User, Perplexity-User, all other agents \(\*\)\.$/);
});

test('user-directed agents are partial when only the wildcard group is blocked', async () => {
  const named = USER_DIRECTED_AGENTS.map((agent) => `User-agent: ${agent.token}`).join('\n');
  const result = await resultOf(robots(`${CLOSED}\n${named}\nAllow: /\n`), ALLOWED);
  assert.deepEqual([result.status, result.summary], ['partial', 'robots.txt blocks these agents on the entry path: all other agents (*).']);
});

test('user-directed agents fail when robots.txt blocks each subject', async () => {
  assert.equal(await statusOf(robots(CLOSED), ALLOWED), 'fail');
  const named = USER_DIRECTED_AGENTS.map((agent) => `User-agent: ${agent.token}`).join('\n');
  assert.equal(await statusOf(robots(`${named}\nUser-agent: *\nDisallow: /\n`), ALLOWED), 'fail');
});

test('the access result is for the entry path and ignores the letter case of a token', async () => {
  const docsBlocked = robots('User-agent: *\nDisallow: /docs/\n');
  assert.equal((await resultOnPath(docsBlocked, ALLOWED, '/docs/page')).status, 'fail');
  assert.equal((await resultOnPath(docsBlocked, ALLOWED, '/blog/page')).status, 'pass');
  assert.equal(await statusOf(docsBlocked, ALLOWED), 'pass');
  assert.equal(await statusOf(robots('user-agent: chatgpt-user\ndisallow: /\n'), ALLOWED), 'partial');
});

test('the bot policy passes for a group that names a training crawler, a search crawler, or a user-directed agent', async () => {
  for (const token of ['GPTBot', 'OAI-SearchBot', 'Claude-User', 'Bytespider']) {
    const result = await resultOf(robots(`User-agent: ${token}\nDisallow: /\n\n${OPEN}`), POLICY);
    assert.deepEqual([result.status, result.summary], ['pass', `robots.txt states a policy for AI agents: a group for ${token}.`]);
  }
});

test('the bot policy passes for a Content-Signal directive or a Content-Usage directive', async () => {
  assert.equal(await statusOf(robots('User-agent: *\nContent-Signal: ai-train=no\nAllow: /\n'), POLICY), 'pass');
  assert.equal(await statusOf(robots('User-agent: *\nContent-Usage: train-ai=n\nAllow: /\n'), POLICY), 'pass');
});

test('the bot policy is partial for a file that names no AI agent', async () => {
  assert.equal(await statusOf(robots(OPEN), POLICY), 'partial');
  assert.equal(await statusOf(robots(`User-agent: Googlebot\nDisallow: /search\n\n${OPEN}`), POLICY), 'partial');
});

test('the bot policy is blocked by a missing robots.txt', async () => {
  const result = await resultOf({}, POLICY);
  assert.deepEqual([result.status, result.blockedBy], ['fail', 'reach.robots-txt']);
});

test('Content Signals pass for a valid directive, with an unknown key, and with a path', async () => {
  const full = await resultOf(robots('User-agent: *\nContent-Signal: search=yes, ai-input=no, ai-train=no\nAllow: /\n'), SIGNALS);
  assert.deepEqual([full.status, full.summary], ['pass', 'robots.txt declares Content Signals: search=yes, ai-input=no, ai-train=no.']);
  const managed = await resultOf(robots('User-Agent: *\nContent-signal: search=yes, ai-train=no, use=reference\nAllow: /\n'), SIGNALS);
  assert.deepEqual([managed.status, managed.summary], ['pass', 'robots.txt declares Content Signals: search=yes, ai-train=no.']);
  const scoped = await resultOf(robots('User-agent: *\nContent-Signal: /blog/ ai-train=no\nAllow: /\n'), SIGNALS);
  assert.match(scoped.summary, /: \/blog\/ ai-train=no\.$/);
});

test('Content Signals are partial for a directive with no valid signal', async () => {
  for (const value of ['ai-train=maybe', 'use=reference', 'AI-Train=No', '']) {
    assert.equal(await statusOf(robots(`User-agent: *\nContent-Signal: ${value}\nAllow: /\n`), SIGNALS), 'partial', value);
  }
});

test('Content Signals fail with no directive and are blocked by a missing robots.txt', async () => {
  const absent = await resultOf(robots(OPEN), SIGNALS);
  assert.deepEqual([absent.status, absent.blockedBy], ['fail', undefined]);
  const missing = await resultOf({}, SIGNALS);
  assert.deepEqual([missing.status, missing.blockedBy], ['fail', 'reach.robots-txt']);
});

test('AIPREF passes for a Content-Usage rule in robots.txt or a Content-Usage header', async () => {
  const rule = await resultOf(robots('User-agent: *\nAllow: /\nContent-Usage: /ai-ok/ train-ai=y\n'), AIPREF);
  assert.deepEqual([rule.status, rule.summary], ['pass', 'Content-Usage declares AI usage preferences in robots.txt.']);
  const header = await resultOf({ '/': html('<html></html>', { 'content-usage': 'train-ai=n, search=y' }) }, AIPREF);
  assert.deepEqual([header.status, header.summary], ['pass', 'Content-Usage declares AI usage preferences in the entry response.']);
  const both = { ...robots('User-agent: *\nContent-Usage: ai-use=n\n'), '/': html('<html></html>', { 'content-usage': 'train-ai=n' }) };
  assert.match((await resultOf(both, AIPREF)).summary, /in robots\.txt and in the entry response\.$/);
});

test('AIPREF is partial for a label or a value that the current draft does not define', async () => {
  for (const value of ['ai=n', 'train-genai=n', 'train-ai=no', 'Train-AI=n']) {
    assert.equal(await statusOf(robots(`User-agent: *\nContent-Usage: ${value}\n`), AIPREF), 'partial', value);
  }
  assert.equal(await statusOf({ '/': html('<html></html>', { 'content-usage': 'train-ai' }) }, AIPREF), 'partial');
});

test('AIPREF fails with no rule and no header, and a missing robots.txt does not block it', async () => {
  assert.equal(await statusOf({ ...HOME, ...robots(OPEN) }, AIPREF), 'fail');
  const missing = await resultOf(HOME, AIPREF);
  assert.deepEqual([missing.status, missing.blockedBy], ['fail', undefined]);
});

test('the training crawler policy is an observation for each robots.txt', async () => {
  const none = await resultOf({}, TRAINING);
  assert.deepEqual([none.status, none.summary], ['info', 'No robots.txt rule restricts an AI training crawler.']);
  const open = await resultOf(robots(OPEN), TRAINING);
  assert.deepEqual([open.status, open.summary], ['info', `For AI training crawlers, robots.txt blocks none and allows ${TRAINING_CRAWLERS.join(', ')}.`]);
  const closed = await resultOf(robots(CLOSED), TRAINING);
  assert.deepEqual([closed.status, closed.summary], ['info', `For AI training crawlers, robots.txt blocks ${TRAINING_CRAWLERS.join(', ')} and allows none.`]);
});

test('the training crawler policy lists the crawlers that a named group blocks', async () => {
  const result = await resultOf(robots(`User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\n${OPEN}`), TRAINING);
  assert.equal(result.status, 'info');
  assert.equal(
    result.summary,
    'For AI training crawlers, robots.txt blocks GPTBot, CCBot and allows ClaudeBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, Amazonbot.',
  );
});

const brandedStrings = USER_DIRECTED_AGENTS.filter((agent) => agent.userAgent).map((agent) => `${agent.userAgent} ${USER_AGENT}`);

test('the branded fetch sends two documented user-agent strings that also name the scanner', async () => {
  const { result, site } = await runCheckOn(HOME, BRANDED);
  assert.deepEqual(site.hits.map((hit) => hit.headers['user-agent']).sort(), [USER_AGENT, ...brandedStrings].sort());
  assert.equal(brandedStrings.length, 2);
  assert.ok(brandedStrings[0].includes('ChatGPT-User/1.0') && brandedStrings[1].includes('Perplexity-User/1.0'));
  assert.deepEqual(site.hits.map((hit) => `${hit.method} ${hit.path}`), ['GET /', 'GET /', 'GET /']);
  assert.equal(result.status, 'info');
  assert.equal(result.summary, 'The entry URL gives HTTP 200 for a plain request and for the user-agent strings of ChatGPT-User and Perplexity-User.');
});

const blockAgent = (pattern, status) => ({
  '/': (request) => (pattern.test(request.headers['user-agent']) ? { status, body: 'Blocked' } : HOME['/']),
});

test('the branded fetch reports a different status as an observation', async () => {
  const forbidden = await resultOf(blockAgent(/ChatGPT-User/, 403), BRANDED);
  assert.equal(forbidden.status, 'info');
  assert.equal(forbidden.summary, 'The entry URL gives HTTP 200 for a plain request, but HTTP 403 for ChatGPT-User and HTTP 200 for Perplexity-User.');
  const limited = await resultOf(blockAgent(/Perplexity-User/, 429), BRANDED);
  assert.equal(limited.status, 'info');
  assert.match(limited.summary, /but HTTP 200 for ChatGPT-User and HTTP 429 for Perplexity-User\.$/);
});

test('the branded fetch is an observation when the host does not answer', async () => {
  const ctx = createContext({ target: 'http://127.0.0.1:9', profile: 'content' });
  const [result] = await runChecks([CHECKS.find((check) => check.id === BRANDED)], ctx);
  assert.equal(result.status, 'info');
  assert.match(result.summary, /^The entry URL gives no response \(network\) for a plain request and for/);
});

test('the verified agents check waits for a review and sends no request', async () => {
  const { result, site } = await runCheckOn(HOME, VERIFIED);
  assert.deepEqual([result.status, result.reason, site.hits.length], ['not_assessed', 'not_reviewed', 0]);
  assert.equal(await statusOf(HOME, VERIFIED, { profile: 'api' }), 'not_applicable');
});

test('the reach checks send four requests: the entry page, robots.txt, and two branded requests', async () => {
  const site = await startSite({ ...HOME, ...robots(OPEN) });
  try {
    const ctx = createContext({ target: site.origin, profile: 'content' });
    await runChecks(CHECKS.filter((check) => check.id.startsWith('reach.')), ctx);
    assert.deepEqual(site.hits.map((hit) => `${hit.method} ${hit.path}`).sort(), ['GET /', 'GET /', 'GET /', 'GET /robots.txt']);
  } finally {
    await site.close();
  }
});

test('a preference rule splits the optional path from the preferences', () => {
  assert.deepEqual(parsePreference('/blog/ ai-train=no, search=yes', CONTENT_SIGNAL), { path: '/blog/', preferences: { 'ai-train': 'no', search: 'yes' } });
  assert.deepEqual(parsePreference(' train-ai=n;note="x" ,ai-use = y ', CONTENT_USAGE), { path: '', preferences: { 'train-ai': 'n', 'ai-use': 'y' } });
  assert.deepEqual(parsePreference('/only-a-path', CONTENT_USAGE), { path: '/only-a-path', preferences: {} });
});

test('a preference rule ignores an unknown label, an unknown value, and input that is not a rule', () => {
  assert.deepEqual(parsePreference('use=reference, ai-train=maybe, search', CONTENT_SIGNAL).preferences, {});
  assert.deepEqual(parsePreference('search=y', CONTENT_SIGNAL).preferences, {});
  assert.deepEqual(parsePreference('search=yes', CONTENT_USAGE).preferences, {});
  assert.deepEqual(parsePreference('=,;=;,a=b=c', CONTENT_USAGE).preferences, {});
  assert.deepEqual(parsePreference(undefined, CONTENT_USAGE), { path: '', preferences: {} });
});

test('a preference is printed with its path first', () => {
  assert.equal(formatPreferences({ path: '/blog/', preferences: { search: 'yes', 'ai-train': 'no' } }), '/blog/ search=yes, ai-train=no');
  assert.equal(formatPreferences({ path: '', preferences: { 'train-ai': 'n' } }), 'train-ai=n');
});
