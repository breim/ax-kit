import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OPAQUE, readYamlOutline } from '../../skills/ax-kit/scripts/lib/context/yaml-outline.mjs';

const lines = (...rows) => `${rows.join('\n')}\n`;

test('the reader builds nested mappings and reads each scalar as a string', () => {
  const outline = readYamlOutline(lines('openapi: 3.1.0', 'info:', '  title: Acme API', '  version: 1', 'paths:'));
  assert.deepEqual(outline, { openapi: '3.1.0', info: { title: 'Acme API', version: '1' }, paths: null });
});

test('the reader ignores comments, blank lines, a leading document marker, and a byte order mark', () => {
  const text = lines(`${String.fromCharCode(0xfeff)}# header`, '---', '', 'a: 1 # trailing', '  # indented comment', 'b: # empty', '  c: 2');
  assert.deepEqual(readYamlOutline(text), { a: '1', b: { c: '2' } });
});

test('the reader accepts Windows line ends', () => {
  assert.deepEqual(readYamlOutline('a: 1\r\nb:\r\n  - x\r\n  - y: 2\r\n    z: 3\r\n'), { a: '1', b: ['x', { y: '2', z: '3' }] });
});

test('a plain key, a single-quoted key, and a double-quoted key give the same string', () => {
  const text = lines('200: a', "'201': b", '"2XX": c', 'default: d', "'/users/{id}': e", '/items/{id}: f', "'it''s': g", '"a\\tb": h');
  assert.deepEqual(readYamlOutline(text), {
    200: 'a',
    201: 'b',
    '2XX': 'c',
    default: 'd',
    '/users/{id}': 'e',
    '/items/{id}': 'f',
    "it's": 'g',
    'a\tb': 'h',
  });
});

test('a colon splits a key only when a space or the line end follows it', () => {
  const text = lines('url: http://x.test/a:b', 'time: 12:30', 'urn:acme:id: 7', 'application/json:', '  x: 1');
  assert.deepEqual(readYamlOutline(text), {
    url: 'http://x.test/a:b',
    time: '12:30',
    'urn:acme:id': '7',
    'application/json': { x: '1' },
  });
});

test('a hash sign starts a comment only after a space and outside quotes', () => {
  const text = lines("a: '#/components/schemas/User' # comment", 'b: "x # y"', 'c: one#two', 'd: one #two');
  assert.deepEqual(readYamlOutline(text), { a: '#/components/schemas/User', b: 'x # y', c: 'one#two', d: 'one' });
  assert.deepEqual(readYamlOutline(lines('- one # note: two', '- three')), ['one', 'three']);
});

test('the reader skips the content of a block scalar, also when the content looks like YAML', () => {
  const text = lines(
    'info:',
    '  description: |',
    '    paths:',
    '      get: decoy',
    '',
    '    ---',
    '    &anchor *alias [flow',
    '    \tkey: after a tab',
    '  title: Acme',
    'folded: >-',
    '  one',
    '  two',
    'paths: {}',
  );
  const outline = readYamlOutline(text);
  assert.deepEqual(Object.keys(outline), ['info', 'folded', 'paths']);
  assert.deepEqual(Object.keys(outline.info), ['description', 'title']);
  assert.match(outline.info.description, /^paths:\nget: decoy/);
  assert.equal(outline.folded, 'one\ntwo');
});

test('a block scalar ends at the first line that is not deeper than its key', () => {
  assert.deepEqual(readYamlOutline(lines('a:', '  b: |', '    text', '  c: 1')), { a: { b: 'text', c: '1' } });
  assert.deepEqual(readYamlOutline(lines('a: |', '  text', 'b: 1')), { a: 'text', b: '1' });
  assert.deepEqual(readYamlOutline(lines('- |', '  text', '- b')), ['text', 'b']);
});

test('the reader skips the continuation lines of a plain scalar', () => {
  const text = lines('summary: Get a user', '  and all the details', 'operationId: getUser');
  assert.deepEqual(readYamlOutline(text), { summary: 'Get a user', operationId: 'getUser' });
});

test('the reader builds sequences of scalars and of mappings', () => {
  const text = lines('servers:', '  - url: https://a.test', '    description: Production', '  - url: https://b.test', 'tags:', '  - users', '  -', '    name: admin');
  assert.deepEqual(readYamlOutline(text), {
    servers: [{ url: 'https://a.test', description: 'Production' }, { url: 'https://b.test' }],
    tags: ['users', { name: 'admin' }],
  });
});

test('a sequence can start at the indent of its parent key', () => {
  const text = lines('security:', '- bearerAuth: []', '- oauth:', '  - read', 'paths: {}');
  assert.deepEqual(readYamlOutline(text), { security: [{ bearerAuth: [] }, { oauth: ['read'] }], paths: {} });
});

test('a key with no value is null when the next line is not deeper', () => {
  assert.deepEqual(readYamlOutline(lines('- a:', '- b: 1')), [{ a: null }, { b: '1' }]);
  assert.deepEqual(readYamlOutline(lines('a:', 'b: 1', 'c:')), { a: null, b: '1', c: null });
  assert.deepEqual(readYamlOutline(lines('x:', '  a:', '  b: 1')), { x: { a: null, b: '1' } });
});

test('an empty flow collection is an empty list or an empty mapping', () => {
  const text = lines('security: []', 'schemas: {}', 'spaced: [ ]', 'items:', '  - {}', '  - []');
  assert.deepEqual(readYamlOutline(text), { security: [], schemas: {}, spaced: [], items: [{}, []] });
});

test('a flow collection with content on one line is an opaque value', () => {
  const outline = readYamlOutline(lines('tags: [users, "a]b"] # comment', "schema: { $ref: '#/components/schemas/User' }", 'list:', '  - {name: id}'));
  assert.deepEqual(outline, { tags: OPAQUE, schema: OPAQUE, list: [OPAQUE] });
  assert.deepEqual(readYamlOutline(lines('a: [1, 2] # ]', 'b: {} # }')), { a: OPAQUE, b: {} });
  assert.deepEqual(readYamlOutline(lines('a: ["x"]', "b: ['y']", 'c: ["x \\" ]"]', 'd: [x#y]')), { a: OPAQUE, b: OPAQUE, c: OPAQUE, d: OPAQUE });
});

test('a flow collection on more lines is an opaque value when its lines are deeper than its key', () => {
  const text = lines('example:', '  {', '    "text": "a } b: c",', '    "list": [1, 2] # ]', '', '  }', 'required: [', '    id,', '    name ]', 'next: 1');
  assert.deepEqual(readYamlOutline(text), { example: OPAQUE, required: OPAQUE, next: '1' });
  assert.deepEqual(readYamlOutline(lines('a:', '  [', '  ]', 'b: 1')), { a: [], b: '1' });
  assert.equal(readYamlOutline(lines('{', '  "openapi": "3.1.0"', '}')), OPAQUE);
});

test('a quoted scalar can continue on deeper lines', () => {
  const text = lines('a: "first\\', '    \\ second" # comment', "b: 'it''s", '', "  here'", 'c:', '  - "x', '    y"', 'd: 1');
  const outline = readYamlOutline(text);
  assert.deepEqual(Object.keys(outline), ['a', 'b', 'c', 'd']);
  assert.match(outline.a, /^first.*second$/);
  assert.deepEqual([outline.b, outline.c, outline.d], ["it's  here", ['x y'], '1']);
});

test('an ampersand or an asterisk in the middle of a scalar is not an anchor', () => {
  assert.deepEqual(readYamlOutline(lines('a: Tom & Jerry', 'b: ^a*b$', "c: '*/*'")), { a: 'Tom & Jerry', b: '^a*b$', c: '*/*' });
});

const UNSUPPORTED = {
  'an anchor on a value': lines('a: &base', '  b: 1'),
  'an anchor on a scalar': lines('a: &x 1'),
  'an alias as a value': lines('a: 1', 'b: *x'),
  'an alias as a list item': lines('a:', '  - *x'),
  'a merge key': lines('a:', '  <<: *base'),
  'an anchor before a key': lines('&x a: 1'),
  'a tag': lines('a: !!str 1'),
  'a complex key': lines('? a', ': b'),
  'a tab in the indentation': lines('a:', '\tb: 1'),
  'a tab after spaces in the indentation': lines('a:', '  \tb: 1'),
  'a tab after a dash': lines('a:', '  -\tb'),
  'a second document': lines('a: 1', '---', 'b: 2'),
  'content after the document end marker': lines('a: 1', '...', 'b: 2'),
  'a directive': lines('%YAML 1.2', '---', 'a: 1'),
  'a flow collection that ends at the indent of its key': lines('a: [', '  b', ']'),
  'a flow collection with no end': lines('a:', '  b: [', '    c', 'd: 1'),
  'a flow collection with an apostrophe': lines("a: [it's, fine]"),
  'a flow collection with a quote that does not end on its line': lines('a: [', '  "b', '  c"', '  ]'),
  'text after a flow collection': lines('a: [b] c'),
  'text after a flow collection on more lines': lines('a:', '  [', '  ] c'),
  'a quoted scalar that continues at the indent of its key': lines('a:', '  b: "first', '  second"'),
  'a quoted scalar with no end': lines('a: "first', '  second'),
  'text after a quoted scalar': lines('a: "b" c'),
  'text after a quoted scalar on more lines': lines('a: "b', '  c" d'),
  'a deeper line after a quoted scalar': lines('a: "b"', '  c: 1'),
  'a deeper line after a flow collection': lines('a: []', '  c: 1'),
  'a key in the continuation of a plain scalar': lines('a: text', '  b: 1'),
  'a dash in the continuation of a plain scalar': lines('a:', '  - 1', '    - 2'),
  'a dash in a mapping': lines('a: 1', '- b'),
  'a nested sequence on one line': lines('- - a'),
  'a line that is not a key': lines('a:', '  b: 1', '  stray'),
  'a comment before the colon of a key': lines('a # note: b'),
  'a deeper dash after a mapping in a list': lines('- a: 1', '  - b'),
  'a deeper key between two keys of a nested mapping': lines('a:', '  b: "x"', '    c: 1', '  d: 2'),
  'a line that is deeper than its mapping': lines('a: 1', 'b:', '    c: 1', '  d: 2'),
  'a duplicate key': lines('a: 1', 'a: 2'),
  'a __proto__ key': lines('__proto__: 1'),
  'a scalar document': lines('hello'),
  'an indent that is too deep': lines('a:', `${' '.repeat(201)}b: 1`),
};

for (const [construct, text] of Object.entries(UNSUPPORTED)) {
  test(`the reader returns null for ${construct}`, () => {
    assert.equal(readYamlOutline(text), null);
  });
}

test('the reader returns null for an empty document, and accepts a document end marker', () => {
  assert.equal(readYamlOutline(''), null);
  assert.equal(readYamlOutline('# only a comment\n'), null);
  assert.deepEqual(readYamlOutline(lines('a: 1', '...', '# end')), { a: '1' });
});

test('the reader stays fast on long lines that have no end', () => {
  const started = Date.now();
  assert.equal(readYamlOutline(`a${' '.repeat(200000)}b\n`), null);
  assert.equal(readYamlOutline(`a: ["${'\\"'.repeat(200000)}\n`), null);
  assert.equal(readYamlOutline(`a: "${'\\"'.repeat(200000)}\n`), null);
  assert.equal(readYamlOutline(`"${'\\"'.repeat(200000)}\n`), null);
  assert.equal(readYamlOutline(`a: [${"'' ".repeat(200000)}\n`), null);
  assert.ok(Date.now() - started < 2000);
});
