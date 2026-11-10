import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyMcpResponse, sseMessages } from '../../skills/ax-kit/scripts/lib/context/mcp-probe.mjs';

const response = (body, { status = 200, type = 'application/json', headers = {} } = {}) => ({
  status,
  headers: { 'content-type': type, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const stream = (body, status) => response(body, { status, type: 'text/event-stream; charset=utf-8' });

const discovered = { jsonrpc: '2.0', id: 1, result: { resultType: 'complete', supportedVersions: ['2026-07-28', '2025-11-25'], capabilities: {} } };
const rpcError = (code, data) => ({ jsonrpc: '2.0', id: 1, error: { code, message: 'Error', ...(data ? { data } : {}) } });

test('the SSE reader returns the JSON message of each event', () => {
  const body = 'event: message\ndata: {"a":1}\n\ndata:{"b":2}\n\n';
  assert.deepEqual(sseMessages(body), [{ a: 1 }, { b: 2 }]);
});

test('the SSE reader joins data lines, and skips comments, empty events, and text that is not JSON', () => {
  const body = ': keep-alive\r\n\r\nid: 1\r\ndata:\r\n\r\ndata: {"a":\r\ndata: 1}\r\n\r\ndata: not json\r\n\r\ndata: [1]\r\n\r\n';
  assert.deepEqual(sseMessages(body), [{ a: 1 }]);
  assert.deepEqual(sseMessages(''), []);
});

test('a result that lists the supported versions is a modern server', () => {
  assert.deepEqual(classifyMcpResponse(response(discovered)), { kind: 'modern', versions: ['2026-07-28', '2025-11-25'] });
});

test('an SSE stream is read to the first answer, after a notification', () => {
  const notification = { jsonrpc: '2.0', method: 'notifications/progress', params: {} };
  const body = `: ping\n\nid: 0\ndata:\n\ndata: ${JSON.stringify(notification)}\n\nevent: message\ndata: ${JSON.stringify(discovered)}\n\n`;
  assert.equal(classifyMcpResponse(stream(body)).kind, 'modern');
});

test('a 401 response is an authorization challenge only with a WWW-Authenticate header', () => {
  const challenge = { 'www-authenticate': 'Bearer resource_metadata="https://x.test/.well-known/oauth-protected-resource"' };
  assert.deepEqual(classifyMcpResponse(response('Unauthorized', { status: 401, type: 'text/plain', headers: challenge })), { kind: 'authorization' });
  assert.deepEqual(classifyMcpResponse(response('Unauthorized', { status: 401, type: 'text/plain' })), { kind: 'absent' });
  assert.equal(classifyMcpResponse(response(discovered, { status: 200, headers: challenge })).kind, 'modern');
});

test('a result with no version list is incomplete', () => {
  const result = (fields) => response({ jsonrpc: '2.0', id: 1, result: fields });
  assert.deepEqual(classifyMcpResponse(result({ capabilities: {} })), { kind: 'incomplete' });
  assert.deepEqual(classifyMcpResponse(result({ supportedVersions: [] })), { kind: 'incomplete' });
  assert.deepEqual(classifyMcpResponse(result({ supportedVersions: [20260728] })), { kind: 'incomplete' });
  assert.deepEqual(classifyMcpResponse(result({ supportedVersions: '2026-07-28' })), { kind: 'incomplete' });
});

test('an unsupported-version error gives the versions that the server lists', () => {
  const body = rpcError(-32022, { supported: ['2027-01-01'], requested: '2026-07-28' });
  assert.deepEqual(classifyMcpResponse(response(body, { status: 400 })), { kind: 'other-revision', versions: ['2027-01-01'] });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32022), { status: 400 })), { kind: 'other-revision', versions: [] });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32022, 'text'), { status: 400 })), { kind: 'other-revision', versions: [] });
});

test('an error code that only revision 2026-07-28 defines is a rejected request', () => {
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32020), { status: 400 })), { kind: 'rejected', code: -32020 });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32021), { status: 400 })), { kind: 'rejected', code: -32021 });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32099), { status: 400 })), { kind: 'rejected', code: -32099 });
});

test('each other JSON-RPC error is an older server, with each HTTP status', () => {
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32601), { status: 404 })), { kind: 'older', code: -32601 });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32000), { status: 400 })), { kind: 'older', code: -32000 });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32019))), { kind: 'older', code: -32019 });
  assert.deepEqual(classifyMcpResponse(response(rpcError(-32100))), { kind: 'older', code: -32100 });
  assert.deepEqual(classifyMcpResponse(stream(`data: ${JSON.stringify(rpcError(-32601))}\n\n`)), { kind: 'older', code: -32601 });
});

test('a JSON-RPC error with no id is an answer', () => {
  const body = { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Bad Request: Server not initialized' } };
  assert.equal(classifyMcpResponse(response(body, { status: 400 })).kind, 'older');
});

test('a body that is not a JSON-RPC answer is absent', () => {
  const absent = (snapshot) => assert.deepEqual(classifyMcpResponse(snapshot), { kind: 'absent' });
  absent(response('Not found', { status: 404, type: 'text/plain' }));
  absent(response('', { status: 405, type: 'text/plain' }));
  absent(response('<!doctype html><html></html>', { type: 'text/html' }));
  absent(response({ ok: true }));
  absent(response({ result: { supportedVersions: ['2026-07-28'] } }));
  absent(response({ jsonrpc: '1.0', result: { supportedVersions: ['2026-07-28'] } }));
  absent(response({ jsonrpc: '2.0', method: 'notifications/message' }));
  absent(response({ jsonrpc: '2.0', id: 1, result: 'text' }));
  absent(response([discovered]));
  absent(response('', { status: 400 }));
  absent(stream('data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n'));
  absent(response('{"jsonrpc":"2.0"', { type: undefined }));
});

test('a JSON body with an event-stream content type is not read as JSON', () => {
  assert.deepEqual(classifyMcpResponse(stream(JSON.stringify(discovered))), { kind: 'absent' });
});
