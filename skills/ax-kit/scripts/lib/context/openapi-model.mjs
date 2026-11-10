import { isJsonObject } from '../json.mjs';
import { loadOpenapi } from './api-description.mjs';
import { OPAQUE, readYamlOutline } from './yaml-outline.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
const SUCCESS = /^2(\d\d|XX)$/i;
const CLIENT_ERROR = /^4(\d\d|XX)$/i;
const BODILESS = ['204', '205'];
const SCHEMA_BRANCHES = ['allOf', 'oneOf', 'anyOf'];
const REFERENCE_HOPS = 4;
const SCHEMA_NODES = 200;

class Unreadable extends Error {}

function readable(value) {
  if (value === OPAQUE) throw new Unreadable();
  return value;
}

const field = (node, key) => (isJsonObject(readable(node)) && Object.hasOwn(node, key) ? readable(node[key]) : undefined);
const mapOf = (node) => (isJsonObject(readable(node)) ? node : {});
const listOf = (node) => (Array.isArray(readable(node)) ? node.map(readable) : []);
const textOf = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const sizeOf = (value) => (Array.isArray(value) ? value.length : Object.keys(mapOf(value)).length);

const unescapePointer = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~');

function resolve(document, node, hops = REFERENCE_HOPS) {
  const pointer = field(node, '$ref');
  if (typeof pointer !== 'string' || !pointer.startsWith('#/') || hops === 0) return node;
  const target = pointer.slice(2).split('/').map(unescapePointer).reduce((at, key) => field(at, key), document);
  return target === undefined ? node : resolve(document, target, hops - 1);
}

const isReference = (node) => typeof field(node, '$ref') === 'string';
const mediaTypesOf = (body) => Object.values(mapOf(field(body, 'content')));
const describesBody = (response) =>
  isReference(response) || [response, ...mediaTypesOf(response)].some((holder) => sizeOf(field(holder, 'schema')) > 0);

const hasOwnExample = (node) =>
  isJsonObject(node) && (Object.hasOwn(node, 'example') || node.examples === OPAQUE || sizeOf(node.examples) > 0);

function schemaHasExample(document, schema, budget) {
  const node = resolve(document, schema);
  budget.nodes -= 1;
  if (!isJsonObject(node) || budget.nodes < 0) return false;
  if (hasOwnExample(node)) return true;
  const children = [
    ...Object.values(mapOf(field(node, 'properties'))),
    field(node, 'items'),
    ...SCHEMA_BRANCHES.flatMap((keyword) => listOf(field(node, keyword))),
  ];
  return children.some((child) => schemaHasExample(document, child, budget));
}

function operationHasExample(document, { parameters, requestBody, responses }) {
  const budget = { nodes: SCHEMA_NODES };
  const bodies = [requestBody, ...responses.map(([, response]) => response)];
  const holders = [...parameters, ...bodies, ...bodies.flatMap(mediaTypesOf)];
  return holders.some(hasOwnExample) || holders.some((holder) => schemaHasExample(document, field(holder, 'schema'), budget));
}

function requirementNames(security) {
  if (!Array.isArray(readable(security))) return null;
  return listOf(security).flatMap((requirement) => Object.keys(mapOf(requirement)));
}

function describeOperation(document, path, method, pathItem) {
  const operation = field(pathItem, method);
  const resolved = (node) => resolve(document, node);
  const responses = Object.entries(mapOf(field(operation, 'responses'))).map(([code, response]) => [code, resolved(response)]);
  const parameters = [...listOf(field(pathItem, 'parameters')), ...listOf(field(operation, 'parameters'))].map(resolved);
  const requestBody = resolved(field(operation, 'requestBody'));
  const security = requirementNames(field(operation, 'security'));
  return {
    method,
    path,
    operationId: textOf(field(operation, 'operationId')),
    hasSummaryOrDescription: Boolean(textOf(field(operation, 'summary')) ?? textOf(field(operation, 'description'))),
    hasSuccessSchema: responses.some(([code, response]) => SUCCESS.test(code) && (BODILESS.includes(code) || describesBody(response))),
    hasErrorResponse: responses.some(([code]) => code === 'default' || CLIENT_ERROR.test(code)),
    hasExample: operationHasExample(document, { parameters, requestBody, responses }),
    security,
    hasSecurity: Boolean(security?.length),
  };
}

function operationsOf(document) {
  return Object.entries(mapOf(field(document, 'paths')))
    .filter(([path]) => path.startsWith('/'))
    .flatMap(([path, item]) => {
      const pathItem = resolve(document, item);
      return METHODS.filter((method) => isJsonObject(field(pathItem, method))).map((method) =>
        describeOperation(document, path, method, pathItem),
      );
    });
}

function versionOf(document) {
  const openapi = textOf(field(document, 'openapi'));
  const swagger = textOf(field(document, 'swagger'));
  if (openapi?.startsWith('3.')) return { family: 'openapi3', version: openapi };
  if (swagger?.startsWith('2.')) return { family: 'swagger2', version: swagger };
  return { family: 'unknown', version: openapi ?? swagger };
}

function serversOf(document) {
  const urls = listOf(field(document, 'servers')).map((server) => textOf(field(server, 'url')));
  const host = textOf(field(document, 'host'));
  return [...urls, host && `${host}${textOf(field(document, 'basePath')) ?? ''}`].filter(Boolean);
}

function build(document) {
  if (!isJsonObject(document)) throw new Unreadable();
  return {
    state: 'ready',
    ...versionOf(document),
    title: textOf(field(field(document, 'info'), 'title')),
    servers: serversOf(document),
    operations: operationsOf(document),
    securitySchemes: [
      ...Object.keys(mapOf(field(field(document, 'components'), 'securitySchemes'))),
      ...Object.keys(mapOf(field(document, 'securityDefinitions'))),
    ],
    security: requirementNames(field(document, 'security')),
  };
}

export function modelOf(document) {
  try {
    return build(document);
  } catch (error) {
    if (error instanceof Unreadable) return { state: 'unreadable' };
    throw error;
  }
}

const documentOf = (description) =>
  description.document ?? (description.snapshot.truncated ? null : readYamlOutline(description.snapshot.body));

export function loadOperations(ctx) {
  return ctx.once('openapiOperations', async () => {
    const description = await loadOpenapi(ctx);
    if (description.state === 'missing') return { state: 'missing' };
    return { ...modelOf(documentOf(description)), format: description.format, url: description.url, snapshot: description.snapshot };
  });
}
