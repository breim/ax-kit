import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { LIMITS } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';

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

const DISCOVERED = { jsonrpc: '2.0', id: 1, result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' } };
const rpcError = (code, status, data) => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code, message: 'Error', data } }) });
const mcp = (response) => ({ 'POST /mcp': response });
const mcpResult = async (response) => (await runCheckOn(mcp(response), 'act.mcp-endpoint', API)).result;

test('the MCP probe sends one server/discover request with the headers of revision 2026-07-28', async () => {
  const { status, site: fixture } = await runCheckOn(mcp(json(DISCOVERED)), 'act.mcp-endpoint', API);
  assert.equal(status, 'pass');
  assert.equal(fixture.hits.length, 1);
  const [hit] = fixture.hits;
  assert.deepEqual([hit.method, hit.path], ['POST', '/mcp']);
  assert.equal(hit.headers['content-type'], 'application/json');
  assert.equal(hit.headers.accept, 'application/json, text/event-stream');
  assert.equal(hit.headers['mcp-protocol-version'], '2026-07-28');
  assert.equal(hit.headers['mcp-method'], 'server/discover');
  assert.equal(hit.headers['mcp-name'], undefined);
  assert.equal(hit.headers.origin, undefined);
  assert.deepEqual(JSON.parse(hit.body), {
    jsonrpc: '2.0',
    id: 1,
    method: 'server/discover',
    params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'ax-kit', version: '0.1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
});

test('the MCP endpoint passes for a discover result in JSON and in an SSE stream', async () => {
  const result = await mcpResult(json(DISCOVERED));
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /supports the protocol versions 2026-07-28\.$/);
  const stream = { status: 200, headers: { 'content-type': 'text/event-stream' }, body: `: ping\n\nid: 1\ndata:\n\nevent: message\ndata: ${JSON.stringify(DISCOVERED)}\n\n` };
  assert.equal((await mcpResult(stream)).status, 'pass');
});

test('the MCP endpoint passes for a 401 response with a WWW-Authenticate header', async () => {
  const challenge = { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://x.test/.well-known/oauth-protected-resource"' }, body: '' };
  const result = await mcpResult(challenge);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /asks for authorization/);
  assert.equal((await mcpResult({ status: 401, body: 'Unauthorized' })).status, 'fail');
});

test('the MCP endpoint is partial for a JSON-RPC error, and the summary gives the cause', async () => {
  const older = await mcpResult(rpcError(-32601, 404));
  assert.equal(older.status, 'partial');
  assert.match(older.summary, /JSON-RPC error -32601.*older revision/);
  assert.equal((await mcpResult(rpcError(-32000, 400))).status, 'partial');
  const other = await mcpResult(rpcError(-32022, 400, { supported: ['2025-11-25'], requested: '2026-07-28' }));
  assert.equal(other.status, 'partial');
  assert.match(other.summary, /does not support revision 2026-07-28, and it lists 2025-11-25\.$/);
  assert.match((await mcpResult(rpcError(-32022, 400))).summary, /does not support revision 2026-07-28\.$/);
  const rejected = await mcpResult(rpcError(-32020, 400));
  assert.equal(rejected.status, 'partial');
  assert.doesNotMatch(rejected.summary, /older/);
  const incomplete = await mcpResult(json({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } }));
  assert.equal(incomplete.status, 'partial');
  assert.match(incomplete.summary, /does not list the supported protocol versions/);
});

test('the MCP endpoint fails for 404, 405, HTML, and a body that is not JSON-RPC', async () => {
  assert.equal((await runCheckOn({}, 'act.mcp-endpoint', API)).status, 'fail');
  assert.equal((await mcpResult({ status: 405, headers: { allow: 'GET' }, body: '' })).status, 'fail');
  assert.equal((await mcpResult(html('<!doctype html><html><body>App</body></html>'))).status, 'fail');
  assert.equal((await mcpResult(json({ ok: true }))).status, 'fail');
  assert.equal((await mcpResult({ status: 400, body: '' })).status, 'fail');
  const result = await mcpResult(json({ ok: true }));
  assert.match(result.evidence[0].observed, /HTTP 200, absent/);
});

test('the MCP endpoint does not answer a GET route', async () => {
  const { status, site: fixture } = await runCheckOn({ 'GET /mcp': json(DISCOVERED) }, 'act.mcp-endpoint', API);
  assert.equal(status, 'fail');
  assert.deepEqual(fixture.hits.map((hit) => hit.method), ['POST']);
});

test('the MCP endpoint is not assessed for a server error or a rate limit', async () => {
  const failed = await mcpResult({ status: 503, body: '' });
  assert.deepEqual([failed.status, failed.reason], ['not_assessed', 'server_error']);
  const limited = await mcpResult({ status: 429, body: '' });
  assert.deepEqual([limited.status, limited.reason], ['not_assessed', 'rate_limited']);
});

test('the MCP endpoint is not applicable to the content profile and sends no request', async () => {
  const { status, site: fixture } = await runCheckOn(mcp(json(DISCOVERED)), 'act.mcp-endpoint', { profile: 'content' });
  assert.equal(status, 'not_applicable');
  assert.equal(fixture.hits.length, 0);
});

const page = (body) => ({ '/': html(`<!doctype html><html><body>${body}</body></html>`) });
const webmcp = (body, options) => statusOf(page(body), 'act.webmcp', options);

test('WebMCP passes for a form with a tool name and a tool description', async () => {
  const form = '<form action="/search" toolname="search_products" tooldescription="Search the product catalog."><input name="q"></form>';
  const { result } = await runCheckOn(page(form), 'act.webmcp');
  assert.equal(result.status, 'pass');
  assert.match(result.evidence[0].observed, /1 tool forms, 0 inline scripts/);
  assert.equal(await webmcp(`<FORM ToolName='a' ToolDescription='b'></FORM>`), 'pass');
});

test('WebMCP passes for an inline script that calls registerTool', async () => {
  assert.equal(await webmcp('<script>document.modelContext.registerTool({ name: "a" });</script>'), 'pass');
  assert.equal(await webmcp('<script type="module">await document.modelContext?.registerTool(tool)</script>'), 'pass');
  assert.equal(await webmcp('<script>const { modelContext } = document;\nmodelContext\n  .registerTool(tool);</script>'), 'pass');
});

test('WebMCP fails for a form with one attribute, an empty attribute, or an external script', async () => {
  assert.equal(await webmcp('<form toolname="search"></form>'), 'fail');
  assert.equal(await webmcp('<form tooldescription="Search."></form>'), 'fail');
  assert.equal(await webmcp('<form toolname="" tooldescription="Search."></form>'), 'fail');
  assert.equal(await webmcp('<form action="/search"></form><script src="/app.js"></script>'), 'fail');
  assert.equal(await webmcp('<script src="/app.js">document.modelContext.registerTool(tool)</script>'), 'fail');
  assert.equal(await webmcp('<script>const registerTool = 1; document.modelContext.getTools();</script>'), 'fail');
  assert.equal(await webmcp('<p>Call document.modelContext.registerTool( to add a tool.</p>'), 'fail');
});

test('WebMCP fails for an entry URL that is not HTML, and applies to the page profiles only', async () => {
  assert.equal(await statusOf({ '/': text('<form toolname="a" tooldescription="b"></form>') }, 'act.webmcp'), 'fail');
  assert.equal(await webmcp('<form toolname="a" tooldescription="b"></form>', { profile: 'webapp' }), 'pass');
  assert.equal(await webmcp('<form toolname="a" tooldescription="b"></form>', { profile: 'commerce' }), 'pass');
  assert.equal(await webmcp('<form toolname="a" tooldescription="b"></form>', API), 'not_applicable');
});

test('the review checks are not assessed by the scanner and have a rubric', async () => {
  for (const id of ['act.mcp-tools', 'act.safe-retries', 'act.pagination', 'act.cli-or-sdk']) {
    const { result, site: fixture } = await runCheckOn({}, id, API);
    assert.deepEqual([result.status, result.reason], ['not_assessed', 'not_reviewed'], id);
    assert.equal(fixture.hits.length, 0, id);
  }
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
