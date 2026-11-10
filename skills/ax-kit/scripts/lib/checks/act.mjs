import { blocksOf, loadEntryDoc, tagsOf } from '../context/html.mjs';
import { MCP_PATH, MCP_REVISION, loadMcpProbe } from '../context/mcp-probe.mjs';
import { loadMissingPage } from '../context/missing-page.mjs';
import { loadOperations } from '../context/openapi-model.mjs';
import { parseChallenges } from '../context/www-authenticate.mjs';
import { API_PROFILES, PAGE_PROFILES } from '../model.mjs';
import { reviewChecks } from './act-review.mjs';
import { blocked, byRatio, fail, partial, pass, seen } from './result.mjs';

const SAMPLE = 5;
const REGISTER_TOOL = /\bmodelContext\s*\??\.\s*registerTool\s*\(/;
const NOT_READY = 'The API description is missing or has no readable operation, so this check has no result.';

const INVALID = [
  [(model) => model.state === 'unreadable', 'The scanner cannot read the YAML API description, so publish a JSON version of the file.'],
  [(model) => model.operations.length === 0, 'The API description has no operation.'],
  [(model) => !model.title, 'The API description has no title in info.title.'],
  [(model) => model.family === 'unknown', 'The API description does not declare OpenAPI 3 or Swagger 2.0.'],
];

const observedModel = (model) =>
  model.state === 'ready' ? `${model.format}, version ${model.version}, ${model.operations.length} operations` : `${model.format}, unreadable`;

async function runOpenapiValid(ctx) {
  const model = await loadOperations(ctx);
  if (model.state === 'missing') {
    return blocked('discover.api-description', 'The scanner found no API description, so it cannot assess the content.');
  }
  const evidence = [seen(model.snapshot, observedModel(model))];
  const invalid = INVALID.find(([applies]) => applies(model));
  if (invalid) return fail(invalid[1], evidence);
  if (model.family === 'swagger2') {
    return partial(`The API description uses Swagger ${model.version}, which is older than OpenAPI 3.`, evidence);
  }
  return pass(`The API description is OpenAPI ${model.version} with a title and ${model.operations.length} operations.`, evidence);
}

const isUsable = (model) => model.state === 'ready' && model.operations.length > 0;
const nameOf = (operation) => `${operation.method.toUpperCase()} ${operation.path}`;

function shareEvidence(model, missing) {
  const sample = missing.slice(0, SAMPLE).map(nameOf).join(', ');
  return [seen(model.snapshot, missing.length === 0 ? 'all operations' : `not met by ${missing.length}: ${sample}`)];
}

function shareCheck({ meets, describe, thresholds = () => undefined }) {
  return async (ctx) => {
    const model = await loadOperations(ctx);
    if (!isUsable(model)) return blocked('act.openapi-valid', NOT_READY);
    const total = model.operations.length;
    const missing = model.operations.filter((operation) => !meets(operation));
    const met = total - missing.length;
    return byRatio(met / total, `${met} of ${total} operations ${describe}.`, shareEvidence(model, missing), thresholds(total));
  };
}

const runOperations = shareCheck({
  meets: (operation) => Boolean(operation.operationId) && operation.hasSummaryOrDescription,
  describe: 'have an operationId and a summary or a description',
});

const runResponses = shareCheck({
  meets: (operation) => operation.hasSuccessSchema && operation.hasErrorResponse,
  describe: 'have a success schema and an error response',
});

const runExamples = shareCheck({
  meets: (operation) => operation.hasExample,
  describe: 'have an example',
  thresholds: (total) => ({ passAt: 0.5, partialAt: 1 / total }),
});

const statesNoAuthentication = (model) =>
  model.security !== null || model.operations.every((operation) => operation.security !== null);

async function runSecurity(ctx) {
  const model = await loadOperations(ctx);
  if (!isUsable(model)) return blocked('act.openapi-valid', NOT_READY);
  const named = [...new Set([...(model.security ?? []), ...model.operations.flatMap((operation) => operation.security ?? [])])];
  const used = named.filter((name) => model.securitySchemes.includes(name));
  const evidence = [seen(model.snapshot, `schemes: ${model.securitySchemes.join(', ') || 'none'}; required: ${named.join(', ') || 'none'}`)];
  if (used.length > 0) return pass(`The security requirements of the API description use the declared schemes: ${used.join(', ')}.`, evidence);
  if (model.securitySchemes.length > 0) {
    return partial('The API description declares security schemes, but no security requirement uses them.', evidence);
  }
  if (named.length === 0 && statesNoAuthentication(model)) {
    return pass('The API description states with an empty security requirement that the API needs no authentication.', evidence);
  }
  return fail('The API description declares no security scheme and does not state that the API needs no authentication.', evidence);
}

const listed = (versions) => (versions.length > 0 ? `, and it lists ${versions.join(', ')}` : '');

const UNAUTHORIZED = 401;
const MCP_BLANKET_CHALLENGE = `The server asks for credentials on each path, so the answer at ${MCP_PATH} does not show an MCP server. Add a resource_metadata parameter to the challenge.`;

const MCP_VERDICTS = {
  modern: ({ versions }) => pass(`An MCP server at ${MCP_PATH} answers server/discover and supports the protocol versions ${versions.join(', ')}.`),
  authorization: () => pass(`The MCP endpoint at ${MCP_PATH} asks for authorization with a WWW-Authenticate header.`),
  'other-revision': ({ versions }) =>
    partial(`An MCP server answers at ${MCP_PATH}, but it does not support revision ${MCP_REVISION}${listed(versions)}.`),
  older: ({ code }) =>
    partial(`An MCP server answers at ${MCP_PATH} with JSON-RPC error ${code}, so it uses an older revision that has no server/discover method.`),
  rejected: ({ code }) => partial(`An MCP server at ${MCP_PATH} rejects the server/discover request with JSON-RPC error ${code}.`),
  incomplete: () => partial(`The server at ${MCP_PATH} answers server/discover, but the result does not list the supported protocol versions.`),
  absent: () => fail(`No MCP server answers a server/discover request at ${MCP_PATH}.`),
};

const namesResourceMetadata = (snapshot) =>
  parseChallenges(snapshot.headers['www-authenticate']).some((challenge) => 'resource_metadata' in challenge.params);

// A server that answers 401 on each path gives no evidence of an MCP server at this path.
// The resource_metadata parameter of the MCP authorization specification is the evidence in that case.
async function asksForCredentialsEverywhere(ctx, probe) {
  if (probe.kind !== 'authorization' || namesResourceMetadata(probe.snapshot)) return false;
  return (await loadMissingPage(ctx)).status === UNAUTHORIZED;
}

async function runMcpEndpoint(ctx) {
  const probe = await loadMcpProbe(ctx);
  const evidence = [seen(probe.snapshot, `HTTP ${probe.snapshot.status}, ${probe.kind}`)];
  if (await asksForCredentialsEverywhere(ctx, probe)) return fail(MCP_BLANKET_CHALLENGE, evidence);
  return { ...MCP_VERDICTS[probe.kind](probe), evidence };
}

async function runWebmcp(ctx) {
  const entry = await loadEntryDoc(ctx);
  const body = entry.isHtml ? entry.snapshot.body : '';
  const forms = tagsOf(body, 'form').filter((form) => form.toolname && form.tooldescription);
  const scripts = blocksOf(body, 'script').filter((script) => !script.attributes.src && REGISTER_TOOL.test(script.content));
  const evidence = [seen(entry.snapshot, `${forms.length} tool forms, ${scripts.length} inline scripts with registerTool`)];
  if (forms.length + scripts.length === 0) return fail('The entry HTML declares no WebMCP tool in a form or in an inline script.', evidence);
  return pass('The entry HTML declares a WebMCP tool for browser agents.', evidence);
}

const SPEC = {
  openapi: 'https://spec.openapis.org/oas/latest.html',
  mcp: 'https://modelcontextprotocol.io/specification/2026-07-28',
  webmcp: 'https://webmachinelearning.github.io/webmcp/',
};

const openapiCheck = (check) => ({
  stability: 'stable',
  evidence: 'measured',
  profiles: API_PROFILES,
  spec: SPEC.openapi,
  playbook: 'openapi-quality',
  ...check,
});

export const groups = [];

export const checks = [
  openapiCheck({
    id: 'act.openapi-valid',
    title: 'The API description is OpenAPI 3 with a title and operations',
    why: 'An agent builds each API call from this file. A file that it cannot read gives it nothing to call.',
    tier: 'essential',
    run: runOpenapiValid,
  }),
  openapiCheck({
    id: 'act.openapi-operations',
    title: 'Each operation has an operationId and a summary or a description',
    why: 'An agent selects an operation by its name and its description, because it cannot ask a human what an endpoint does.',
    tier: 'recommended',
    run: runOperations,
  }),
  openapiCheck({
    id: 'act.openapi-responses',
    title: 'Each operation has a success schema and an error response',
    why: 'An agent needs the success schema to read a result, and the error response to know what a failure looks like.',
    tier: 'recommended',
    run: runResponses,
  }),
  openapiCheck({
    id: 'act.openapi-security',
    title: 'The API description declares how to authenticate',
    why: 'An agent that does not know the authentication method sends a request that fails, and no human is there to explain.',
    tier: 'recommended',
    run: runSecurity,
  }),
  openapiCheck({
    id: 'act.openapi-examples',
    title: 'Operations have request or response examples',
    why: 'An example shows an agent a correct request faster than a schema, and it decreases the number of wrong calls.',
    tier: 'optional',
    run: runExamples,
  }),
  {
    id: 'act.mcp-endpoint',
    title: 'An MCP server answers at /mcp',
    why: 'An MCP server gives an agent typed tools that it can call with no custom integration code.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.mcp,
    playbook: 'mcp-server',
    run: runMcpEndpoint,
  },
  {
    id: 'act.webmcp',
    title: 'The page declares WebMCP tools for browser agents',
    why: 'A browser agent that finds a declared tool calls it directly, and does not guess from the elements of the page.',
    tier: 'recommended',
    stability: 'emerging',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.webmcp,
    playbook: 'webmcp',
    reviewed: '2026-11',
    run: runWebmcp,
  },
  ...reviewChecks,
];
