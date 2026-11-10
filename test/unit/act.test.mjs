import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { LIMITS } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';
import { DISCOVERED, mcp } from './act-fixtures.mjs';

const API = { profile: 'api' };
const OK = { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } };

const complete = { operationId: 'op', summary: 'Do it', responses: { 200: OK, 400: { description: 'Error' } } };
const bare = { responses: { 200: { description: 'OK' } } };
const withExample = { ...complete, parameters: [{ name: 'q', in: 'query', example: 'a' }] };

const many = (count, operation) => Array.from({ length: count }, () => operation);
const describe = (operations, extra = {}) => ({
  openapi: '3.1.0',
  info: { title: 'Acme API', version: '1' },
  paths: Object.fromEntries(operations.map((operation, index) => [`/r${index}`, { get: operation }])),
  ...extra,
});
const site = (document) => ({ '/openapi.json': json(document) });
const mix = (good, bad, goodOperation = complete, badOperation = bare) => site(describe([...many(good, goodOperation), ...many(bad, badOperation)]));

const YAML_HEAD = 'openapi: 3.0.3\ninfo:\n  title: Acme\n';
const READABLE_YAML = `${YAML_HEAD}paths:\n  /a:\n    get:\n      operationId: getA\n      summary: Get A\n      responses:\n        '200':\n          description: OK\n`;
const UNREADABLE_YAML = `${YAML_HEAD}paths:\n  /a: &item\n    get:\n      operationId: getA\n`;
const OPENAPI_FOLLOWERS = ['act.openapi-operations', 'act.openapi-responses', 'act.openapi-security', 'act.openapi-examples'];

test('the API description is valid when it is OpenAPI 3 with a title and an operation', async () => {
  const { result } = await runCheckOn(site(describe([complete])), 'act.openapi-valid', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /OpenAPI 3\.1\.0 with a title and 1 operations/);
  assert.equal(await statusOf(site({ ...describe([complete]), openapi: '3.0.3' }), 'act.openapi-valid', API), 'pass');
});

test('a Swagger 2.0 description is partial', async () => {
  const swagger = { swagger: '2.0', info: { title: 'Old' }, paths: { '/a': { get: bare } } };
  const { result } = await runCheckOn({ '/swagger.json': json(swagger) }, 'act.openapi-valid', API);
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /Swagger 2\.0/);
});

test('a description with no operation, no title, or an unknown version fails', async () => {
  const failure = async (document) => (await runCheckOn(site(document), 'act.openapi-valid', API)).result;
  assert.deepEqual([(await failure(describe([]))).status, (await failure(describe([]))).blockedBy], ['fail', undefined]);
  assert.match((await failure(describe([]))).summary, /no operation/);
  assert.match((await failure(describe([complete], { info: {} }))).summary, /no title/);
  assert.match((await failure(describe([complete], { openapi: '4.0.0' }))).summary, /does not declare OpenAPI 3/);
  assert.equal((await failure({ swagger: '2.0', paths: { '/a': { get: bare } } })).status, 'fail');
});

test('the validity check is blocked when no API description exists', async () => {
  const { result } = await runCheckOn({}, 'act.openapi-valid', API);
  assert.deepEqual([result.status, result.blockedBy], ['fail', 'discover.api-description']);
});

test('a YAML description that the outline reader can read is assessed', async () => {
  assert.equal(await statusOf({ '/openapi.yaml': text(READABLE_YAML) }, 'act.openapi-valid', API), 'pass');
  assert.equal(await statusOf({ '/openapi.yaml': text(READABLE_YAML) }, 'act.openapi-operations', API), 'pass');
  assert.equal(await statusOf({ '/openapi.yaml': text(READABLE_YAML) }, 'act.openapi-responses', API), 'fail');
});

test('an unreadable YAML description fails with advice to publish JSON, and blocks the other OpenAPI checks', async () => {
  const routes = { '/openapi.yaml': text(UNREADABLE_YAML) };
  const { result } = await runCheckOn(routes, 'act.openapi-valid', API);
  assert.deepEqual([result.status, result.blockedBy], ['fail', undefined]);
  assert.match(result.summary, /publish a JSON version/);
  for (const id of OPENAPI_FOLLOWERS) {
    const follower = (await runCheckOn(routes, id, API)).result;
    assert.deepEqual([follower.status, follower.blockedBy], ['fail', 'act.openapi-valid'], id);
  }
});

test('a YAML description that is larger than the body limit is unreadable', async () => {
  const large = `${READABLE_YAML}# ${'x'.repeat(LIMITS.bodyBytes)}\n`;
  const { result } = await runCheckOn({ '/openapi.yaml': text(large) }, 'act.openapi-valid', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /publish a JSON version/);
});

test('the other OpenAPI checks are blocked when the description is missing or has no operation', async () => {
  for (const id of OPENAPI_FOLLOWERS) {
    const missing = (await runCheckOn({}, id, API)).result;
    assert.deepEqual([missing.status, missing.blockedBy], ['fail', 'act.openapi-valid'], id);
    const empty = (await runCheckOn(site(describe([])), id, API)).result;
    assert.deepEqual([empty.status, empty.blockedBy], ['fail', 'act.openapi-valid'], id);
  }
});

test('the OpenAPI checks are not assessed when the server fails', async () => {
  const { result } = await runCheckOn({ '/openapi.json': { status: 503 } }, 'act.openapi-valid', API);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

test('the OpenAPI checks apply to the api and webapp profiles only', async () => {
  const { status, site: fixture } = await runCheckOn(site(describe([complete])), 'act.openapi-valid', { profile: 'content' });
  assert.equal(status, 'not_applicable');
  assert.equal(fixture.hits.length, 0);
  assert.equal(await statusOf(site(describe([complete])), 'act.openapi-valid', { profile: 'webapp' }), 'pass');
});

test('operations pass at 90 percent, are partial from 50 percent, and fail below', async () => {
  assert.equal(await statusOf(mix(10, 0), 'act.openapi-operations', API), 'pass');
  assert.equal(await statusOf(mix(9, 1), 'act.openapi-operations', API), 'pass');
  assert.equal(await statusOf(mix(8, 1), 'act.openapi-operations', API), 'partial');
  assert.equal(await statusOf(mix(5, 5), 'act.openapi-operations', API), 'partial');
  assert.equal(await statusOf(mix(4, 5), 'act.openapi-operations', API), 'fail');
  assert.equal(await statusOf(mix(0, 3), 'act.openapi-operations', API), 'fail');
});

test('an operation needs an operationId and also a summary or a description', async () => {
  const only = (operation) => statusOf(site(describe([operation])), 'act.openapi-operations', API);
  assert.equal(await only({ operationId: 'a', summary: 'A' }), 'pass');
  assert.equal(await only({ operationId: 'a', description: 'A.' }), 'pass');
  assert.equal(await only({ operationId: 'a' }), 'fail');
  assert.equal(await only({ summary: 'A', description: 'A.' }), 'fail');
});

test('the operations summary counts the operations and the evidence names the gaps', async () => {
  const { result } = await runCheckOn(mix(8, 1), 'act.openapi-operations', API);
  assert.match(result.summary, /^8 of 9 operations have an operationId/);
  assert.match(result.evidence[0].observed, /not met by 1: GET \/r8/);
});

test('responses pass at 90 percent, are partial from 50 percent, and fail below', async () => {
  assert.equal(await statusOf(mix(9, 1), 'act.openapi-responses', API), 'pass');
  assert.equal(await statusOf(mix(8, 1), 'act.openapi-responses', API), 'partial');
  assert.equal(await statusOf(mix(5, 5), 'act.openapi-responses', API), 'partial');
  assert.equal(await statusOf(mix(4, 5), 'act.openapi-responses', API), 'fail');
});

test('an operation needs a success schema and also an error response', async () => {
  const only = (responses) => statusOf(site(describe([{ responses }])), 'act.openapi-responses', API);
  assert.equal(await only({ 200: OK, default: { description: 'Error' } }), 'pass');
  assert.equal(await only({ 204: { description: 'Deleted' }, 404: { description: 'Missing' } }), 'pass');
  assert.equal(await only({ 200: OK }), 'fail');
  assert.equal(await only({ 200: OK, 500: { description: 'Error' } }), 'fail');
  assert.equal(await only({ 200: { description: 'OK' }, 400: { description: 'Error' } }), 'fail');
});

test('examples pass at 50 percent, are partial above zero, and fail at zero', async () => {
  const examples = (good, bad) => statusOf(mix(good, bad, withExample, complete), 'act.openapi-examples', API);
  assert.equal(await examples(5, 5), 'pass');
  assert.equal(await examples(4, 5), 'partial');
  assert.equal(await examples(1, 19), 'partial');
  assert.equal(await examples(0, 4), 'fail');
  assert.equal(await examples(1, 0), 'pass');
});

const schemes = { components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } };
const security = (operations, extra) => statusOf(site(describe(operations, extra)), 'act.openapi-security', API);

test('security passes when a requirement uses a declared scheme', async () => {
  assert.equal(await security([complete], { ...schemes, security: [{ bearerAuth: [] }] }), 'pass');
  assert.equal(await security([complete, { ...complete, security: [{ bearerAuth: [] }] }], schemes), 'pass');
  const swagger = { swagger: '2.0', info: { title: 'Old' }, securityDefinitions: { key: { type: 'apiKey' } }, security: [{ key: [] }], paths: { '/a': { get: bare } } };
  assert.equal(await statusOf({ '/swagger.json': json(swagger) }, 'act.openapi-security', API), 'pass');
});

test('security is partial when schemes exist and no requirement uses them', async () => {
  assert.equal(await security([complete], schemes), 'partial');
  assert.equal(await security([complete], { ...schemes, security: [] }), 'partial');
  assert.equal(await security([complete], { ...schemes, security: [{ otherAuth: [] }] }), 'partial');
});

test('security passes with no scheme when an empty requirement states that the API is public', async () => {
  assert.equal(await security([complete], { security: [] }), 'pass');
  assert.equal(await security([complete], { security: [{}] }), 'pass');
  assert.equal(await security([{ ...complete, security: [] }, { ...complete, security: [{}] }]), 'pass');
  const { result } = await runCheckOn(site(describe([complete], { security: [] })), 'act.openapi-security', API);
  assert.match(result.summary, /needs no authentication/);
});

test('security fails with no scheme and no statement', async () => {
  assert.equal(await security([complete]), 'fail');
  assert.equal(await security([{ ...complete, security: [] }, complete]), 'fail');
  assert.equal(await security([complete], { security: [{ ghost: [] }] }), 'fail');
  assert.equal(await security([{ ...complete, security: [{ ghost: [] }] }], { security: [] }), 'fail');
});

const isAct = (check) => check.id.startsWith('act.');

async function hitsOf(routes, checks, profile) {
  const fixture = await startSite(routes);
  try {
    const results = await runChecks(checks, createContext({ target: fixture.origin, profile }));
    return { hits: fixture.hits, results };
  } finally {
    await fixture.close();
  }
}

test('all the Act checks on one context send one POST and add one request to a scan', async () => {
  const routes = { '/': html('<!doctype html><html></html>'), ...site(describe([complete])), ...mcp(json(DISCOVERED)) };
  for (const profile of ['api', 'webapp']) {
    const all = await hitsOf(routes, CHECKS, profile);
    const others = await hitsOf(routes, CHECKS.filter((check) => !isAct(check)), profile);
    const posts = all.hits.filter((hit) => hit.method === 'POST');
    assert.deepEqual(posts.map((hit) => hit.path), ['/mcp'], profile);
    assert.equal(all.hits.length - others.hits.length, 1, profile);
    assert.equal(all.hits.filter((hit) => hit.path === '/openapi.json').length, 1, profile);
  }
});

test('a catalog with two description links makes the Act checks add three requests to a scan', async () => {
  const catalog = { linkset: [{ anchor: '/v1', 'service-desc': [{ href: '/specs/v1.yaml' }, { href: '/specs/v1.json' }] }] };
  const routes = {
    '/': html('<!doctype html><html></html>'),
    '/.well-known/api-catalog': json(catalog),
    '/specs/v1.yaml': text(READABLE_YAML),
    '/specs/v1.json': json(describe([complete])),
    ...mcp(json(DISCOVERED)),
  };
  const all = await hitsOf(routes, CHECKS, 'api');
  const others = await hitsOf(routes, CHECKS.filter((check) => !isAct(check)), 'api');
  const pathsOf = (hits) => hits.map((hit) => `${hit.method} ${hit.path}`);
  const added = pathsOf(all.hits).filter((hit) => !pathsOf(others.hits).includes(hit));
  assert.deepEqual(added.sort(), ['GET /specs/v1.json', 'GET /specs/v1.yaml', 'POST /mcp']);
  assert.equal(all.hits.length - others.hits.length, 3);
  assert.equal(all.results.find((result) => result.id === 'act.openapi-valid').status, 'pass');
});

test('the content profile runs no Act request for the API', async () => {
  const routes = { '/': html('<!doctype html><html></html>'), ...mcp(json(DISCOVERED)) };
  const { hits, results } = await hitsOf(routes, CHECKS.filter(isAct), 'content');
  assert.deepEqual(hits.map((hit) => `${hit.method} ${hit.path}`), ['GET /']);
  assert.deepEqual(results.filter((result) => result.status !== 'not_applicable').map((result) => result.id), ['act.webmcp']);
});

test('the Act pillar has six score checks, one watch check, and four review checks', () => {
  const act = CHECKS.filter(isAct);
  const measured = act.filter((check) => check.evidence === 'measured');
  assert.deepEqual(measured.filter((check) => check.stability === 'stable').map((check) => [check.id, check.tier]), [
    ['act.openapi-valid', 'essential'],
    ['act.openapi-operations', 'recommended'],
    ['act.openapi-responses', 'recommended'],
    ['act.openapi-security', 'recommended'],
    ['act.openapi-examples', 'optional'],
    ['act.mcp-endpoint', 'recommended'],
  ]);
  assert.deepEqual(measured.filter((check) => check.stability === 'emerging').map((check) => [check.id, check.tier, check.profiles]), [
    ['act.webmcp', 'recommended', ['content', 'webapp', 'commerce']],
  ]);
  assert.deepEqual(act.filter((check) => check.evidence === 'judged').map((check) => [check.id, check.tier, check.playbook]), [
    ['act.mcp-tools', 'recommended', 'mcp-server'],
    ['act.safe-retries', 'recommended', 'api-design'],
    ['act.pagination', 'optional', 'api-design'],
    ['act.cli-or-sdk', 'optional', 'api-design'],
  ]);
});
