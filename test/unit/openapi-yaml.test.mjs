import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modelOf } from '../../skills/ax-kit/scripts/lib/context/openapi-model.mjs';
import { readYamlOutline } from '../../skills/ax-kit/scripts/lib/context/yaml-outline.mjs';
import { DOCUMENT, YAML } from './act-fixtures.mjs';

test('the YAML outline of the same description gives the same model', () => {
  assert.deepEqual(modelOf(readYamlOutline(YAML)), modelOf(DOCUMENT));
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
