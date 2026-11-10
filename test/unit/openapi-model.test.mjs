import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modelOf } from '../../skills/ax-kit/scripts/lib/context/openapi-model.mjs';
import { DOCUMENT } from './act-fixtures.mjs';

const operation = (model, method, path) => model.operations.find((candidate) => candidate.method === method && candidate.path === path);

test('the model of a JSON document has the version, the title, the servers, and the security names', () => {
  const model = modelOf(DOCUMENT);
  assert.deepEqual(
    { ...model, operations: model.operations.length },
    {
      state: 'ready',
      family: 'openapi3',
      version: '3.1.0',
      title: 'Acme API',
      servers: ['https://api.acme.example/v1'],
      operations: 4,
      securitySchemes: ['bearerAuth'],
      security: ['bearerAuth'],
    },
  );
});

test('the model has one record for each path and method, and ignores extension keys', () => {
  const names = modelOf(DOCUMENT).operations.map((record) => `${record.method} ${record.path}`);
  assert.deepEqual(names, ['get /users', 'post /users', 'get /users/{id}', 'delete /users/{id}']);
});

test('each operation record has the facts that the checks read', () => {
  const model = modelOf(DOCUMENT);
  assert.deepEqual(operation(model, 'get', '/users'), {
    method: 'get',
    path: '/users',
    operationId: 'listUsers',
    hasSummaryOrDescription: true,
    hasSuccessSchema: true,
    hasErrorResponse: true,
    hasExample: true,
    security: null,
    hasSecurity: false,
  });
  assert.deepEqual(operation(model, 'post', '/users'), {
    method: 'post',
    path: '/users',
    operationId: 'createUser',
    hasSummaryOrDescription: true,
    hasSuccessSchema: false,
    hasErrorResponse: true,
    hasExample: true,
    security: null,
    hasSecurity: false,
  });
  assert.deepEqual(operation(model, 'get', '/users/{id}'), {
    method: 'get',
    path: '/users/{id}',
    operationId: null,
    hasSummaryOrDescription: true,
    hasSuccessSchema: true,
    hasErrorResponse: false,
    hasExample: false,
    security: null,
    hasSecurity: false,
  });
  assert.deepEqual(operation(model, 'delete', '/users/{id}'), {
    method: 'delete',
    path: '/users/{id}',
    operationId: 'deleteUser',
    hasSummaryOrDescription: false,
    hasSuccessSchema: true,
    hasErrorResponse: true,
    hasExample: false,
    security: [],
    hasSecurity: false,
  });
});

const single = (operationFields, extra = {}) =>
  modelOf({ openapi: '3.0.3', info: { title: 'T' }, paths: { '/a': { get: operationFields } }, ...extra }).operations[0];
const withResponses = (responses, extra) => single({ responses }, extra);
const jsonBody = (mediaType) => ({ content: { 'application/json': mediaType } });

test('a success schema needs a 2xx response with a schema that is not empty, or a reference', () => {
  assert.equal(withResponses({ 200: jsonBody({ schema: { type: 'object' } }) }).hasSuccessSchema, true);
  assert.equal(withResponses({ '2XX': jsonBody({ schema: { $ref: '#/missing' } }) }).hasSuccessSchema, true);
  assert.equal(withResponses({ 201: { $ref: 'other.yaml#/Created' } }).hasSuccessSchema, true);
  assert.equal(withResponses({ 200: jsonBody({ schema: {} }) }).hasSuccessSchema, false);
  assert.equal(withResponses({ 200: { description: 'OK' } }).hasSuccessSchema, false);
  assert.equal(withResponses({ 302: jsonBody({ schema: { type: 'object' } }) }).hasSuccessSchema, false);
  assert.equal(withResponses({ 400: jsonBody({ schema: { type: 'object' } }) }).hasSuccessSchema, false);
  assert.equal(withResponses({}).hasSuccessSchema, false);
});

test('a 204 or a 205 response needs no schema, and other 2xx responses do', () => {
  assert.equal(withResponses({ 204: { description: 'Deleted' } }).hasSuccessSchema, true);
  assert.equal(withResponses({ 205: { description: 'Reset' } }).hasSuccessSchema, true);
  assert.equal(withResponses({ 202: { description: 'Accepted' } }).hasSuccessSchema, false);
});

test('a local response reference is followed to its target', () => {
  const components = (response) => ({ components: { responses: { Target: response } } });
  const responses = { 200: { $ref: '#/components/responses/Target' } };
  assert.equal(withResponses(responses, components(jsonBody({ schema: { type: 'object' } }))).hasSuccessSchema, true);
  assert.equal(withResponses(responses, components({ description: 'No body' })).hasSuccessSchema, false);
});

test('a reference that the model cannot follow counts as a described response', () => {
  assert.equal(withResponses({ 200: { $ref: '#/components/responses/Missing' } }).hasSuccessSchema, true);
  assert.equal(withResponses({ 200: { $ref: 'https://x.test/shared.json#/Ok' } }).hasSuccessSchema, true);
  assert.equal(withResponses({ 200: { $ref: 7 } }).hasSuccessSchema, false);
});

test('a reference cycle does not stop the model', () => {
  const extra = { components: { responses: { A: { $ref: '#/components/responses/B' }, B: { $ref: '#/components/responses/A' } } } };
  assert.equal(withResponses({ 200: { $ref: '#/components/responses/A' } }, extra).hasSuccessSchema, true);
  const loop = { components: { schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } } } };
  assert.equal(withResponses({ 200: jsonBody({ schema: { $ref: '#/components/schemas/Node' } }) }, loop).hasExample, false);
});

test('an error response is a 4xx response or the default response', () => {
  assert.equal(withResponses({ 404: {} }).hasErrorResponse, true);
  assert.equal(withResponses({ '4XX': {} }).hasErrorResponse, true);
  assert.equal(withResponses({ default: {} }).hasErrorResponse, true);
  assert.equal(withResponses({ 200: {}, 500: {} }).hasErrorResponse, false);
});

test('an example can be on a parameter, a media type, or a schema', () => {
  assert.equal(single({ parameters: [{ name: 'q', in: 'query', example: 'a' }] }).hasExample, true);
  assert.equal(single({ parameters: [{ name: 'q', in: 'query', examples: { one: { value: 'a' } } }] }).hasExample, true);
  assert.equal(single({ parameters: [{ name: 'q', in: 'query', schema: { type: 'string', example: 'a' } }] }).hasExample, true);
  assert.equal(single({ requestBody: jsonBody({ example: { a: 1 } }) }).hasExample, true);
  assert.equal(single({ requestBody: jsonBody({ schema: { type: 'object', examples: [{ a: 1 }] } }) }).hasExample, true);
  assert.equal(withResponses({ 200: jsonBody({ examples: { one: { value: 1 } } }) }).hasExample, true);
  assert.equal(withResponses({ 200: jsonBody({ example: null }) }).hasExample, true);
});

test('an example in a nested schema counts, and a property with the name example does not', () => {
  const nested = (leaf) => ({ type: 'object', properties: { list: { type: 'array', items: { allOf: [leaf] } } } });
  assert.equal(withResponses({ 200: jsonBody({ schema: nested({ type: 'string', example: 'a' }) }) }).hasExample, true);
  assert.equal(withResponses({ 200: jsonBody({ schema: nested({ type: 'string' }) }) }).hasExample, false);
  const named = { type: 'object', properties: { example: { type: 'string' }, examples: { type: 'array' } } };
  assert.equal(withResponses({ 200: jsonBody({ schema: named }) }).hasExample, false);
});

test('an empty examples value and an operation with no body have no example', () => {
  assert.equal(withResponses({ 200: jsonBody({ examples: {} }) }).hasExample, false);
  assert.equal(withResponses({ 200: jsonBody({ schema: { examples: [] } }) }).hasExample, false);
  assert.equal(single({}).hasExample, false);
});

test('a path-level parameter with an example counts for each operation of the path', () => {
  const model = modelOf({
    openapi: '3.1.0',
    paths: { '/a/{id}': { parameters: [{ name: 'id', in: 'path', example: '1' }], get: {}, put: {} }, '/b': { get: {} } },
  });
  assert.deepEqual(model.operations.map((record) => record.hasExample), [true, true, false]);
});

test('an operation needs a text operationId, and a summary or a description that is not blank', () => {
  assert.equal(single({ operationId: 'getA' }).operationId, 'getA');
  assert.equal(single({ operationId: '  ' }).operationId, null);
  assert.equal(single({ operationId: 7 }).operationId, null);
  assert.equal(single({ summary: 'Get A' }).hasSummaryOrDescription, true);
  assert.equal(single({ description: 'Gets A.' }).hasSummaryOrDescription, true);
  assert.equal(single({ summary: '', description: ' ' }).hasSummaryOrDescription, false);
});

test('the security names come from the requirement objects', () => {
  assert.deepEqual(single({ security: [{ key: [] }, { oauth: ['read'], key: [] }] }).security, ['key', 'oauth', 'key']);
  assert.equal(single({ security: [{ key: [] }] }).hasSecurity, true);
  assert.deepEqual(single({ security: [{}] }).security, []);
  assert.equal(single({ security: [{}] }).hasSecurity, false);
  assert.equal(single({ security: 'none' }).security, null);
});

test('the model reads Swagger 2.0 fields', () => {
  const model = modelOf({
    swagger: '2.0',
    info: { title: 'Old API' },
    host: 'api.acme.example',
    basePath: '/v1',
    securityDefinitions: { apiKey: { type: 'apiKey', name: 'X-Key', in: 'header' } },
    security: [{ apiKey: [] }],
    definitions: { Pet: { type: 'object', example: { name: 'Rex' } } },
    paths: {
      '/pets': {
        get: { operationId: 'listPets', summary: 'List', responses: { 200: { description: 'OK', schema: { $ref: '#/definitions/Pet' } }, default: { description: 'Error' } } },
        post: { parameters: [{ in: 'body', name: 'pet', schema: { type: 'object' } }], responses: { 201: { description: 'Created', examples: { 'application/json': {} } } } },
      },
    },
  });
  assert.deepEqual([model.family, model.version, model.title], ['swagger2', '2.0', 'Old API']);
  assert.deepEqual(model.servers, ['api.acme.example/v1']);
  assert.deepEqual(model.securitySchemes, ['apiKey']);
  assert.deepEqual(model.security, ['apiKey']);
  assert.deepEqual(model.operations.map((record) => [record.hasSuccessSchema, record.hasErrorResponse, record.hasExample]), [
    [true, true, true],
    [false, false, true],
  ]);
});

test('the model reports an unknown version and a missing title', () => {
  assert.deepEqual([modelOf({ openapi: '4.0.0', paths: {} }).family, modelOf({ openapi: '4.0.0', paths: {} }).version], ['unknown', '4.0.0']);
  assert.equal(modelOf({ swagger: '1.2', paths: {} }).family, 'unknown');
  assert.equal(modelOf({ openapi: '3.1.0', info: { title: ' ' }, paths: {} }).title, null);
});

test('the model reads the query method of OpenAPI 3.2 and ignores keys that are not methods', () => {
  const model = modelOf({ openapi: '3.2.0', paths: { '/a': { query: {}, summary: 'A', servers: [], parameters: [], 'x-note': {} } } });
  assert.deepEqual(model.operations.map((record) => record.method), ['query']);
});

test('malformed values do not stop the model', () => {
  const model = modelOf({
    openapi: '3.1.0',
    info: 'text',
    servers: { url: 'x' },
    security: {},
    components: [],
    paths: { '/a': null, '/b': 'text', '/c': { get: null, post: [], put: { responses: 'text', parameters: {}, requestBody: 7, security: [null, 'x'] } } },
  });
  assert.deepEqual([model.state, model.title, model.security], ['ready', null, null]);
  assert.deepEqual(model.servers, []);
  assert.deepEqual(model.operations.map((record) => [record.method, record.security]), [['put', []]]);
});
