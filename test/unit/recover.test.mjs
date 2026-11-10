import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { errorFormatOf, missingUrlBelow, serverUrlOf } from '../../skills/ax-kit/scripts/lib/context/api-error.mjs';
import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { MISSING_SEGMENT } from '../../skills/ax-kit/scripts/lib/context/missing-page.mjs';
import { PROFILES } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';
import { softNotFound } from '../fixtures/sites.mjs';

const HONEST = 'recover.honest-404';
const ERRORS = 'recover.structured-errors';
const VALIDATORS = 'recover.cache-validators';
const LIFECYCLE = 'recover.deprecation-headers';
const REVIEWS = ['recover.rate-limits', 'recover.actionable-errors'];

const MISSING = `/${MISSING_SEGMENT}`;
const API = { profile: 'api' };
const HOME = html('<html><body>Home</body></html>');
const missing = (response) => ({ [MISSING]: response });
const resultOf = async (routes, checkId, options) => (await runCheckOn(routes, checkId, options)).result;
const outcomeOf = async (routes, checkId, options) => {
  const result = await resultOf(routes, checkId, options);
  return [result.status, result.summary];
};

test('a missing path passes with status 404 or 410', async () => {
  assert.deepEqual(await outcomeOf({}, HONEST), ['pass', 'A missing path returns HTTP 404.']);
  assert.deepEqual(await outcomeOf(missing({ status: 410 }), HONEST), ['pass', 'A missing path returns HTTP 410.']);
});

test('a missing path passes when the server asks for credentials first', async () => {
  const expected = ['pass', 'A missing path asks for credentials before it shows that the path is missing.'];
  assert.deepEqual(await outcomeOf(missing({ status: 401 }), HONEST, API), expected);
});

test('a missing path is partial for a different client error', async () => {
  for (const status of [400, 402, 403, 405, 418]) {
    const expected = ['partial', `A missing path returns HTTP ${status}, which is an error but does not say that the path is missing.`];
    assert.deepEqual(await outcomeOf(missing({ status }), HONEST, API), expected);
  }
});

test('a missing path fails for a soft 404 and for a status below 400', async () => {
  const soft = await outcomeOf({}, HONEST, { notFound: softNotFound });
  assert.deepEqual(soft, ['fail', 'A missing path returns HTTP 200, which is a soft 404.']);
  assert.equal(await statusOf(missing({ status: 204 }), HONEST), 'fail');
  assert.equal(await statusOf(missing({ status: 302 }), HONEST), 'fail');
  assert.equal(await statusOf(missing({ status: 399 }), HONEST), 'fail');
});

test('a missing path fails for a redirect that ends at a 200 page', async () => {
  const routes = { '/': HOME, ...missing({ status: 302, headers: { location: '/' } }) };
  assert.deepEqual(await outcomeOf(routes, HONEST), ['fail', 'A missing path redirects to / with HTTP 200, which is a soft 404.']);
});

test('a missing path passes for a redirect that ends at a 404 page', async () => {
  assert.equal(await statusOf(missing({ status: 301, headers: { location: '/not-found' } }), HONEST), 'pass');
});

test('a missing path fails for a redirect loop', async () => {
  const result = await resultOf(missing({ status: 302, headers: { location: MISSING } }), HONEST);
  assert.deepEqual([result.status, result.summary], ['fail', 'A request for a missing path gets no response: too_many_redirects.']);
});

test('a missing path has no result on a server error or a rate limit', async () => {
  const down = await resultOf(missing({ status: 503 }), HONEST);
  assert.deepEqual([down.status, down.reason], ['not_assessed', 'server_error']);
  const limited = await resultOf(missing({ status: 429 }), HONEST);
  assert.deepEqual([limited.status, limited.reason], ['not_assessed', 'rate_limited']);
});

test('the missing path check sends one GET request to the fixed path, in each profile', async () => {
  for (const profile of PROFILES) {
    const { status, site } = await runCheckOn({}, HONEST, { profile });
    assert.equal(status, 'pass', profile);
    assert.deepEqual(site.hits.map((hit) => `${hit.method} ${hit.path}`), [`GET ${MISSING}`], profile);
  }
});

const PROBLEM = { type: 'https://x.test/problems/not-found', title: 'Not found', status: 404, detail: 'No route matches the path.' };
const problem = (body, status = 404, type = 'application/problem+json') => ({
  status,
  headers: { 'content-type': type },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const jsonError = (body, status = 404) => ({ ...json(body), status });

test('an API error passes when it is a problem details object', async () => {
  assert.deepEqual(await outcomeOf(missing(problem(PROBLEM)), ERRORS, API), ['pass', 'An API error is an RFC 9457 problem details object.']);
  for (const body of [{ title: 'Not found' }, { type: 'about:blank' }, { detail: 'No route matches the path.' }]) {
    assert.equal(await statusOf(missing(problem(body)), ERRORS, API), 'pass', JSON.stringify(body));
  }
  assert.equal(await statusOf(missing(problem(PROBLEM, 404, 'Application/Problem+JSON; charset=utf-8')), ERRORS, API), 'pass');
});

test('an API error passes for each error status, with a status member that agrees or has the wrong type', async () => {
  assert.equal(await statusOf(missing(problem({ ...PROBLEM, status: 400 }, 400)), ERRORS, API), 'pass');
  assert.equal(await statusOf(missing(problem({ ...PROBLEM, status: 401 }, 401)), ERRORS, API), 'pass');
  assert.equal(await statusOf(missing(problem({ ...PROBLEM, status: '404' })), ERRORS, API), 'pass');
});

test('an API error is partial for a problem body with a flaw', async () => {
  const flawed = [{ ...PROBLEM, status: 400 }, { status: 404 }, { title: 404 }, {}];
  for (const body of flawed) {
    const outcome = await outcomeOf(missing(problem(body)), ERRORS, API);
    assert.deepEqual(outcome, ['partial', 'An API error is a JSON object, but it is not a valid application/problem+json response.'], JSON.stringify(body));
  }
});

test('an API error is partial for a JSON object with a message, an error, or a code member', async () => {
  const bodies = [{ message: 'Not found' }, { error: { code: 'not_found' } }, { errors: ['Not found'] }, { code: 404 }, { detail: 'Not Found' }, PROBLEM];
  for (const body of bodies) {
    assert.equal(await statusOf(missing(jsonError(body)), ERRORS, API), 'partial', JSON.stringify(body));
  }
  assert.equal(await statusOf(missing(problem(PROBLEM, 404, 'application/problem+xml')), ERRORS, API), 'partial');
});

test('an API error fails for HTML, plain text, an empty body, and JSON with no error member', async () => {
  const unstructured = 'An API error has no JSON object with a message, an error, or a code member.';
  assert.deepEqual(await outcomeOf({}, ERRORS, API), ['fail', unstructured]);
  assert.equal(await statusOf(missing({ ...softNotFound, status: 404 }), ERRORS, API), 'fail');
  assert.equal(await statusOf(missing({ status: 404, headers: {}, body: '' }), ERRORS, API), 'fail');
  assert.equal(await statusOf(missing(problem('{"title": "Not found"', 404)), ERRORS, API), 'fail');
  for (const body of [['Not found'], { ok: false }, { error: null }, 'Not found', null]) {
    assert.equal(await statusOf(missing(jsonError(body)), ERRORS, API), 'fail', JSON.stringify(body));
  }
});

test('an API error fails when a missing path gets a status below 400', async () => {
  const success = await outcomeOf(missing(problem(PROBLEM, 200)), ERRORS, API);
  assert.deepEqual(success, ['fail', 'The API answers a missing path with HTTP 200, so an agent gets no error.']);
  assert.equal(await statusOf(missing(problem({ ...PROBLEM, status: 399 }, 399)), ERRORS, API), 'fail');
});

test('the API error request asks for JSON below the entry origin when no OpenAPI document exists', async () => {
  const { site } = await runCheckOn({}, ERRORS, API);
  assert.deepEqual(site.hitsFor(MISSING).map((hit) => [hit.method, hit.headers.accept]), [['GET', 'application/json']]);
});

const openapi = (servers) => ({ openapi: '3.1.0', info: { title: 'Acme', version: '1' }, paths: { '/items': {} }, servers });

async function probedPaths(routes) {
  const { status, site } = await runCheckOn(routes, ERRORS, API);
  return { status, paths: site.hits.map((hit) => hit.path).filter((path) => path.endsWith(MISSING)) };
}

test('the API error request goes below the first server URL of the OpenAPI document', async () => {
  for (const url of ['/v1', '/v1/', 'v1']) {
    const routes = { '/openapi.json': json(openapi([{ url }, { url: '/v2' }])), [`/v1${MISSING}`]: problem(PROBLEM) };
    assert.deepEqual(await probedPaths(routes), { status: 'pass', paths: [`/v1${MISSING}`] }, url);
  }
});

test('the API error request resolves a relative server URL against the location of the document', async () => {
  const routes = { '/api/openapi.json': json(openapi([{ url: 'v2' }])), [`/api/v2${MISSING}`]: problem(PROBLEM) };
  assert.deepEqual(await probedPaths(routes), { status: 'pass', paths: [`/api/v2${MISSING}`] });
});

test('the API error request accepts an absolute server URL', async () => {
  const routes = {
    '/openapi.json': (request) => json(openapi([{ url: `http://${request.headers.host}/v3?key=1` }])),
    [`/v3${MISSING}`]: problem(PROBLEM),
  };
  assert.deepEqual(await probedPaths(routes), { status: 'pass', paths: [`/v3${MISSING}`] });
});

test('the API error request uses the entry origin when the server URL is not usable', async () => {
  const unusable = [[{ url: 'https://{tenant}.x.test/v1' }], [{ url: 'ftp://x.test/v1' }], [{ url: 42 }], [], 'https://x.test/v1', undefined];
  for (const servers of unusable) {
    const routes = { '/openapi.json': json(openapi(servers)), ...missing(problem(PROBLEM)) };
    assert.deepEqual(await probedPaths(routes), { status: 'pass', paths: [MISSING] }, JSON.stringify(servers));
  }
  const yamlOnly = { '/openapi.yaml': text('openapi: 3.0.3\nservers:\n  - url: /v1\npaths:\n  /a: {}\n'), ...missing(problem(PROBLEM)) };
  assert.deepEqual(await probedPaths(yamlOnly), { status: 'pass', paths: [MISSING] });
});

test('the API error request starts at the origin when the entry URL has a path', async () => {
  const site = await startSite(missing(problem(PROBLEM)));
  try {
    const ctx = createContext({ target: `${site.origin}/app/dashboard`, profile: 'api' });
    const [result] = await runChecks([CHECKS.find((check) => check.id === ERRORS)], ctx);
    assert.equal(result.status, 'pass');
    assert.equal(site.hitsFor(MISSING).length, 1);
  } finally {
    await site.close();
  }
});

test('the API error check is not applicable to a content site and has no result on a server error', async () => {
  assert.equal(await statusOf({}, ERRORS), 'not_applicable');
  const result = await resultOf(missing({ status: 503 }), ERRORS, API);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

const snapshot = (body, type = 'application/problem+json', status = 404) => ({ status, headers: { 'content-type': type }, body });

test('the error format reader never throws on a bad body', () => {
  assert.equal(errorFormatOf(snapshot('{"title":"Not found"}')), 'problem');
  assert.equal(errorFormatOf(snapshot('{"title":"Not found","status":500}')), 'json');
  assert.equal(errorFormatOf(snapshot('{"message":"Not found"}', 'application/json')), 'json');
  assert.equal(errorFormatOf(snapshot('{"title":')), 'unstructured');
  assert.equal(errorFormatOf(snapshot('')), 'unstructured');
  assert.equal(errorFormatOf(snapshot('[]')), 'unstructured');
  assert.equal(errorFormatOf({ status: 404, headers: {}, body: '{"data":1}' }), 'unstructured');
});

test('the problem template is a problem details object for its own status', () => {
  const template = readFileSync(new URL('../../skills/ax-kit/assets/problem.json', import.meta.url), 'utf8');
  assert.equal(errorFormatOf(snapshot(template, 'application/problem+json', 422)), 'problem');
  assert.equal(errorFormatOf(snapshot(template, 'application/problem+json', 404)), 'json');
});

test('the missing URL keeps the base path and removes the query', () => {
  assert.equal(missingUrlBelow('https://x.test'), `https://x.test${MISSING}`);
  assert.equal(missingUrlBelow('https://x.test/v1'), `https://x.test/v1${MISSING}`);
  assert.equal(missingUrlBelow('https://x.test/v1//?key=1#top'), `https://x.test/v1${MISSING}`);
});

test('the server URL comes only from a JSON OpenAPI document', () => {
  const found = (servers) => ({ state: 'found', url: 'https://x.test/docs/openapi.json', document: { servers } });
  assert.equal(serverUrlOf(found([{ url: 'https://api.x.test/v1' }])), 'https://api.x.test/v1');
  assert.equal(serverUrlOf(found([{ url: '/v1' }])), 'https://x.test/v1');
  assert.equal(serverUrlOf(found([{ url: 'https://{region}.x.test' }])), null);
  assert.equal(serverUrlOf(found(null)), null);
  assert.equal(serverUrlOf({ state: 'yaml_only', url: 'https://x.test/openapi.yaml', document: null }), null);
  assert.equal(serverUrlOf({ state: 'missing' }), null);
});

test('a cache validator passes with an ETag header or a Last-Modified header', async () => {
  const withHeaders = (headers) => ({ '/': html('<html></html>', headers) });
  assert.deepEqual(await outcomeOf(withHeaders({ etag: '"abc"' }), VALIDATORS), ['pass', 'The entry response has a cache validator: etag.']);
  const modified = { 'last-modified': 'Tue, 10 Nov 2026 10:00:00 GMT' };
  assert.deepEqual(await outcomeOf(withHeaders(modified), VALIDATORS), ['pass', 'The entry response has a cache validator: last-modified.']);
  assert.match((await resultOf(withHeaders({ etag: 'W/"abc"', ...modified }), VALIDATORS)).summary, /: etag, last-modified\.$/);
});

test('a cache validator fails with no validator header and is not applicable to an API', async () => {
  assert.equal(await statusOf({ '/': HOME }, VALIDATORS), 'fail');
  assert.equal(await statusOf({ '/': html('<html></html>', { 'cache-control': 'max-age=60' }) }, VALIDATORS), 'fail');
  assert.equal(await statusOf({ '/': html('<html></html>', { etag: '"abc"' }) }, VALIDATORS, API), 'not_applicable');
});

test('the lifecycle headers are an observation when they are absent', async () => {
  const absent = await outcomeOf({ '/': json({}) }, LIFECYCLE, API);
  assert.deepEqual(absent, ['info', 'The entry response and the error response have no Deprecation or Sunset header.']);
  assert.equal(await statusOf({ '/': json({}) }, LIFECYCLE), 'not_applicable');
});

test('the lifecycle headers are reported from the entry response and from the error response', async () => {
  const routes = {
    '/': json({}, { deprecation: '@1688169599' }),
    ...missing({ ...problem(PROBLEM), headers: { 'content-type': 'application/problem+json', sunset: 'Wed, 30 Jun 2027 23:59:59 GMT' } }),
  };
  const result = await resultOf(routes, LIFECYCLE, API);
  assert.equal(result.status, 'info');
  assert.equal(result.summary, 'The API announces a change of its lifecycle: deprecation on the entry response, sunset on the error response.');
  assert.deepEqual(result.evidence.map((item) => item.observed), ['deprecation: @1688169599, sunset: absent', 'deprecation: absent, sunset: Wed, 30 Jun 2027 23:59:59 GMT']);
});

test('the review checks wait for a review, send no request, and apply to an API only', async () => {
  for (const id of REVIEWS) {
    const { result, site } = await runCheckOn({}, id, API);
    assert.deepEqual([result.status, result.reason, site.hits.length], ['not_assessed', 'not_reviewed', 0], id);
    assert.equal(await statusOf({}, id), 'not_applicable', id);
  }
});

async function recoverHits(profile) {
  const site = await startSite({ '/': HOME });
  try {
    const ctx = createContext({ target: site.origin, profile });
    await runChecks(CHECKS.filter((check) => check.id.startsWith('recover.')), ctx);
    return site.hits;
  } finally {
    await site.close();
  }
}

test('the recover checks add one request for a content site and two requests for a web application', async () => {
  const content = await recoverHits('content');
  assert.deepEqual(content.map((hit) => hit.path).sort(), ['/', MISSING]);
  const webapp = await recoverHits('webapp');
  assert.deepEqual(webapp.filter((hit) => hit.path === MISSING).map((hit) => hit.headers.accept).sort(), ['*/*', 'application/json']);
  assert.ok(webapp.every((hit) => hit.method === 'GET'));
});
