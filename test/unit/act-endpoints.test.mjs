import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, text } from '../fixtures/server.mjs';
import { DISCOVERED, mcp } from './act-fixtures.mjs';

const API = { profile: 'api' };

const rpcError = (code, status, data) => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code, message: 'Error', data } }) });
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

const BEARER = { status: 401, headers: { 'www-authenticate': 'Bearer realm="api"' }, body: '' };
const WITH_METADATA = { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://x.test/.well-known/oauth-protected-resource"' }, body: '' };
const everywhere = (challenge) => ({ ...mcp(challenge), '/ax-kit-missing-page-7d1f3a9c': BEARER });

test('a 401 on each path is evidence of an MCP server only with a resource_metadata parameter', async () => {
  const blanket = await runCheckOn(everywhere(BEARER), 'act.mcp-endpoint', { profile: 'api' });
  assert.equal(blanket.status, 'fail');
  assert.match(blanket.result.summary, /asks for credentials on each path/);
  assert.equal(await statusOf(everywhere(WITH_METADATA), 'act.mcp-endpoint', { profile: 'api' }), 'pass');
  assert.equal(await statusOf(mcp(BEARER), 'act.mcp-endpoint', { profile: 'api' }), 'pass');
});
