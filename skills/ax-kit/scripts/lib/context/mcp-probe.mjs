import { isJsonObject, parseJson } from '../json.mjs';
import { SCANNER_VERSION } from '../model.mjs';

export const MCP_REVISION = '2026-07-28';
export const MCP_PATH = '/mcp';

const UNSUPPORTED_VERSION = -32022;

// Revision 2026-07-28 reserves the codes -32020 to -32099, so only a modern server returns them.
const isModernCode = (code) => code <= -32020 && code >= -32099;

const DISCOVER_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'server/discover',
  params: {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': MCP_REVISION,
      'io.modelcontextprotocol/clientInfo': { name: 'ax-kit', version: SCANNER_VERSION },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  },
};

const DISCOVER_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': MCP_REVISION,
  'mcp-method': 'server/discover',
};

const dataOf = (event) =>
  event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');

export const sseMessages = (body) => body.split(/\r?\n\r?\n/).map(dataOf).map(parseJson).filter(isJsonObject);

const isEventStream = (snapshot) => /text\/event-stream/i.test(snapshot.headers['content-type'] ?? '');
const messagesOf = (snapshot) => (isEventStream(snapshot) ? sseMessages(snapshot.body) : [parseJson(snapshot.body)].filter(isJsonObject));
const isError = (error) => isJsonObject(error) && Number.isInteger(error.code);
const isAnswer = (message) => message.jsonrpc === '2.0' && (isJsonObject(message.result) || isError(message.error));
const versionsOf = (list) => (Array.isArray(list) ? list.filter((version) => typeof version === 'string') : []);

function classifyAnswer(answer) {
  if (!answer) return { kind: 'absent' };
  if (answer.result) {
    const versions = versionsOf(answer.result.supportedVersions);
    return versions.length > 0 ? { kind: 'modern', versions } : { kind: 'incomplete' };
  }
  const { code, data } = answer.error;
  if (code === UNSUPPORTED_VERSION) return { kind: 'other-revision', versions: versionsOf(data?.supported) };
  return { kind: isModernCode(code) ? 'rejected' : 'older', code };
}

export function classifyMcpResponse(snapshot) {
  if (snapshot.status === 401 && snapshot.headers['www-authenticate']) return { kind: 'authorization' };
  return classifyAnswer(messagesOf(snapshot).find(isAnswer));
}

export function loadMcpProbe(ctx) {
  return ctx.once('mcpProbe', async () => {
    const snapshot = await ctx.get(ctx.at(MCP_PATH), {
      method: 'POST',
      headers: DISCOVER_HEADERS,
      body: JSON.stringify(DISCOVER_REQUEST),
    });
    return { snapshot, ...classifyMcpResponse(snapshot) };
  });
}
