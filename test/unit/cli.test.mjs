import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs, UsageError } from '../../skills/ax-kit/scripts/lib/cli/args.mjs';
import { exitCodeOf } from '../../skills/ax-kit/scripts/lib/cli/exit.mjs';
import { detectProfile } from '../../skills/ax-kit/scripts/lib/profile/detect.mjs';

test('scan arguments are parsed', () => {
  assert.deepEqual(parseArgs(['scan', 'https://x.test', '--profile', 'api', '--min-score', '70', '--json']), {
    command: 'scan',
    target: 'https://x.test/',
    profile: 'api',
    minScore: 70,
    json: true,
  });
});

test('scan adds https to a bare host and keeps http for a local target', () => {
  assert.equal(parseArgs(['scan', 'example.com']).target, 'https://example.com/');
  assert.equal(parseArgs(['scan', 'http://localhost:3000/docs']).target, 'http://localhost:3000/docs');
  assert.deepEqual([parseArgs(['scan', 'x.test']).profile, parseArgs(['scan', 'x.test']).minScore], [null, null]);
});

test('usage errors are reported', () => {
  const rejects = (argv, pattern) => assert.throws(() => parseArgs(argv), (error) => error instanceof UsageError && pattern.test(error.message));
  rejects([], /No command/);
  rejects(['fly'], /Unknown command: fly/);
  rejects(['scan'], /needs a URL/);
  rejects(['scan', 'x.test', '--profile', 'blog'], /Unknown profile: blog/);
  rejects(['scan', 'x.test', '--fast'], /Unknown option: --fast/);
  rejects(['scan', 'x.test', '--min-score', '70'], /requires --profile/);
  rejects(['scan', 'x.test', '--profile', 'api', '--min-score', '101'], /0 to 100/);
  rejects(['scan', 'x.test', '--profile', 'api', '--min-score', '7.5'], /0 to 100/);
});

test('the minimum score accepts the limits 0 and 100', () => {
  assert.equal(parseArgs(['scan', 'x.test', '--profile', 'api', '--min-score', '0']).minScore, 0);
  assert.equal(parseArgs(['scan', 'x.test', '--profile', 'api', '--min-score', '100']).minScore, 100);
});

test('other commands are parsed', () => {
  assert.deepEqual(parseArgs(['catalog']), { command: 'catalog', format: 'markdown' });
  assert.deepEqual(parseArgs(['catalog', '--json']), { command: 'catalog', format: 'json' });
  assert.deepEqual(parseArgs(['--help']), { command: 'help' });
  assert.deepEqual(parseArgs(['scan', '--version']), { command: 'version' });
});

test('exit codes follow the score and the gate', () => {
  assert.equal(exitCodeOf({ score: null, gate: null }), 4);
  assert.equal(exitCodeOf({ score: null, gate: { outcome: 'no_score' } }), 4);
  assert.equal(exitCodeOf({ score: 10, gate: null }), 0);
  assert.equal(exitCodeOf({ score: 80, gate: { outcome: 'pass' } }), 0);
  assert.equal(exitCodeOf({ score: 80, gate: { outcome: 'fail' } }), 1);
  assert.equal(exitCodeOf({ score: 80, gate: { outcome: 'inconclusive' } }), 3);
});

const entry = (overrides) => ({ url: 'https://www.x.test/', status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>', ...overrides });

test('the profile is content when no other signal exists', () => {
  assert.equal(detectProfile(entry({})).value, 'content');
  assert.equal(detectProfile(entry({})).source, 'detected');
});

test('the profile is api for JSON, a credential challenge, or an api host', () => {
  assert.equal(detectProfile(entry({ headers: { 'content-type': 'application/json' }, body: '{}' })).value, 'api');
  assert.equal(detectProfile(entry({ status: 401, headers: { 'www-authenticate': 'Bearer' } })).value, 'api');
  assert.equal(detectProfile(entry({ url: 'https://api.x.test/' })).value, 'api');
  assert.equal(detectProfile(entry({ status: 401, headers: {} })).value, 'content');
});

test('the profile is commerce for product data or a cart link, before webapp', () => {
  const product = '<html><script type="application/ld+json">{"@type":"Product","name":"Shoe"}</script><a href="/login">Log in</a></html>';
  assert.equal(detectProfile(entry({ body: product })).value, 'commerce');
  assert.equal(detectProfile(entry({ body: '<html><a href="/cart">Cart</a></html>' })).value, 'commerce');
  assert.equal(detectProfile(entry({ body: '<html><a href="/cartoons">Cartoons</a></html>' })).value, 'content');
});

test('the profile is webapp for a login link or a password field', () => {
  assert.equal(detectProfile(entry({ body: '<html><a href="/sign-in">Sign in</a></html>' })).value, 'webapp');
  assert.equal(detectProfile(entry({ body: '<html><input type="password" name="p"></html>' })).value, 'webapp');
  assert.deepEqual(detectProfile(entry({ body: '<html><a href="/login">x</a></html>' })).signals, ['a login or signup link']);
});
