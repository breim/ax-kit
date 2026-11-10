import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modelOf } from '../../skills/ax-kit/scripts/lib/context/openapi-model.mjs';
import { readYamlOutline } from '../../skills/ax-kit/scripts/lib/context/yaml-outline.mjs';

const problem = { description: 'Error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } };

const DOCUMENT = {
  openapi: '3.1.0',
  info: { title: 'Acme API', version: '1.0.0' },
  servers: [{ url: 'https://api.acme.example/v1' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List the users',
        parameters: [{ $ref: '#/components/parameters/Limit' }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          default: { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        operationId: 'createUser',
        description: 'Create a user.\nUse this operation one time for each user.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NewUser' } } } },
        responses: { 201: { description: 'Created' }, 422: problem },
      },
    },
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get a user', responses: { 200: { $ref: '#/components/responses/UserResponse' } } },
      delete: { operationId: 'deleteUser', security: [], responses: { 204: { description: 'Deleted' }, 404: problem } },
    },
    'x-internal': { get: { operationId: 'hidden' } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    parameters: { Limit: { name: 'limit', in: 'query', schema: { type: 'integer' }, example: 20 } },
    responses: {
      Error: problem,
      UserResponse: { description: 'A user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
    },
    schemas: {
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      NewUser: { type: 'object', properties: { name: { type: 'string', example: 'Ada' } } },
      Problem: { type: 'object', properties: { title: { type: 'string' } } },
    },
  },
};

const YAML = `# Acme API description
openapi: 3.1.0
info:
  title: "Acme API"
  version: 1.0.0
servers:
- url: https://api.acme.example/v1
security:
  - bearerAuth: []
tags: [users]
paths:
  /users:
    get:
      operationId: listUsers
      summary: List the users
      tags: [users]
      parameters:
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
        default:
          $ref: "#/components/responses/Error"
    post:
      operationId: createUser
      description: |
        Create a user.
        paths: this line is text
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewUser'
      responses:
        201:
          description: Created
        422:
          description: Error
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
  '/users/{id}':
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get a user
        with all the fields
      responses:
        "200":
          $ref: '#/components/responses/UserResponse'
    delete:
      operationId: deleteUser
      security: []
      responses:
        '204':
          description: Deleted
        '404':
          description: Error
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
  x-internal:
    get:
      operationId: hidden
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  parameters:
    Limit:
      name: limit
      in: query
      schema:
        type: integer
      example: 20
  responses:
    Error:
      description: Error
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
    UserResponse:
      description: A user
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/User'
  schemas:
    User:
      type: object
      required: [id]
      properties:
        id:
          type: string
        name:
          type: string
    NewUser:
      type: object
      properties:
        name:
          type: string
          example: Ada
    Problem:
      type: object
      properties:
        title:
          type: string
`;

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

test('the YAML outline of the same description gives the same model', () => {
  assert.deepEqual(modelOf(readYamlOutline(YAML)), modelOf(DOCUMENT));
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

test('a document that is not a mapping is unreadable', () => {
  assert.deepEqual(modelOf(null), { state: 'unreadable' });
  assert.deepEqual(modelOf(['a']), { state: 'unreadable' });
  assert.deepEqual(modelOf(readYamlOutline('- openapi: 3.1.0\n')), { state: 'unreadable' });
});

const yamlModel = (text) => modelOf(readYamlOutline(text));
const HEAD = 'openapi: 3.1.0\ninfo:\n  title: T\n';

const FLOW_IN_STRUCTURE = {
  paths: `${HEAD}paths: { /a: { get: { operationId: a } } }\n`,
  'a path item': `${HEAD}paths:\n  /a: { get: { operationId: a } }\n`,
  'an operation': `${HEAD}paths:\n  /a:\n    get: { operationId: a }\n`,
  responses: `${HEAD}paths:\n  /a:\n    get:\n      responses: { 200: { description: OK } }\n`,
  'a response': `${HEAD}paths:\n  /a:\n    get:\n      responses:\n        200: { description: OK }\n`,
  content: `${HEAD}paths:\n  /a:\n    get:\n      responses:\n        200:\n          content: { application/json: { schema: { type: object } } }\n`,
  'a schema': `${HEAD}paths:\n  /a:\n    get:\n      responses:\n        200:\n          content:\n            application/json:\n              schema: { type: object }\n`,
  parameters: `${HEAD}paths:\n  /a:\n    get:\n      parameters: [{ name: q, in: query }]\n`,
  'a parameter': `${HEAD}paths:\n  /a:\n    get:\n      parameters:\n        - { name: q, in: query }\n`,
  'an operation security requirement': `${HEAD}paths:\n  /a:\n    get:\n      security: [{ key: [] }]\n`,
  'the top-level security requirement': `${HEAD}security: [{ key: [] }]\npaths: {}\n`,
  components: `${HEAD}paths: {}\ncomponents: { securitySchemes: { key: { type: apiKey } } }\n`,
  'the security schemes': `${HEAD}paths: {}\ncomponents:\n  securitySchemes: { key: { type: apiKey } }\n`,
  info: 'openapi: 3.1.0\ninfo: { title: T }\npaths: {}\n',
  servers: `${HEAD}servers: [{ url: https://a.test }]\npaths: {}\n`,
};

for (const [position, text] of Object.entries(FLOW_IN_STRUCTURE)) {
  test(`a YAML flow collection as the value of ${position} makes the model unreadable`, () => {
    assert.notEqual(readYamlOutline(text), null);
    assert.deepEqual(yamlModel(text), { state: 'unreadable' });
  });
}

test('a YAML flow collection outside the structure keeps the model readable', () => {
  const model = yamlModel(
    `${HEAD}tags: [a, b]\npaths:\n  /a:\n    get:\n      tags: [a]\n      x-codegen: { skip: true }\n      responses:\n        200:\n          content:\n            application/json:\n              example: { id: 1 }\n              schema:\n                type: object\n                required: [id]\n                enum: [a, b]\n`,
  );
  assert.equal(model.state, 'ready');
  assert.deepEqual([model.operations[0].hasSuccessSchema, model.operations[0].hasExample], [true, true]);
});

test('a YAML flow collection in examples counts as an example', () => {
  const model = yamlModel(`${HEAD}paths:\n  /a:\n    get:\n      parameters:\n        - name: q\n          in: query\n          examples: { one: { value: a } }\n`);
  assert.equal(model.operations[0].hasExample, true);
});

test('a YAML construct that the reader does not handle makes the model unreadable', () => {
  assert.deepEqual(yamlModel(`${HEAD}paths:\n  /a: &item\n    get:\n      operationId: a\n  /b: *item\n`), { state: 'unreadable' });
  assert.deepEqual(yamlModel(`${HEAD}paths:\n\t/a:\n`), { state: 'unreadable' });
});
