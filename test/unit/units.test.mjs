import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildUnits } from '../../skills/ax-kit/scripts/lib/scoring/units.mjs';

const ALL = ['content', 'api'];

const check = (id, overrides = {}) => ({
  id,
  tier: 'recommended',
  stability: 'stable',
  evidence: 'measured',
  profiles: ALL,
  ...overrides,
});

const GROUPS = [
  { id: 'read.markdown', tier: 'recommended', stability: 'stable', profiles: ALL },
  { id: 'discover.mcp', tier: 'recommended', stability: 'emerging', profiles: ALL },
];

const CHECKS = [
  check('reach.plain-fetch', { tier: 'essential', gate: true }),
  check('discover.llms-txt'),
  check('discover.sitemap', { profiles: ['content'] }),
  check('discover.agent-skills', { stability: 'emerging' }),
  check('discover.llms-full-txt', { tier: 'info' }),
  check('authorize.self-serve-credentials', { evidence: 'judged', tier: 'essential' }),
  check('read.markdown-negotiation', { group: 'read.markdown' }),
  check('read.markdown-url', { group: 'read.markdown', stability: 'emerging' }),
  check('read.markdown-old-path', { group: 'read.markdown', stability: 'legacy' }),
  check('discover.mcp-server-card', { group: 'discover.mcp', stability: 'emerging' }),
];

const results = (statuses) => Object.entries(statuses).map(([id, status]) => ({ id, status }));

const unitsFor = (statuses, profile = 'content') =>
  buildUnits({ checks: CHECKS, groups: GROUPS, results: results(statuses), profile });

const idsOf = (units) => units.map((unit) => unit.id);

test('only measured checks on stable standards become units', () => {
  const units = unitsFor({});
  assert.deepEqual(idsOf(units), ['reach.plain-fetch', 'discover.llms-txt', 'discover.sitemap', 'read.markdown']);
});

test('a check that does not apply to the profile leaves the units', () => {
  assert.equal(idsOf(unitsFor({}, 'api')).includes('discover.sitemap'), false);
});

test('a missing result counts as not assessed, never as a pass', () => {
  const [gate] = unitsFor({});
  assert.deepEqual([gate.lower, gate.upper], [0, 2]);
});

test('the gate flag follows the check record', () => {
  const units = unitsFor({ 'reach.plain-fetch': 'pass' });
  assert.deepEqual(
    units.map((unit) => unit.gate),
    [true, false, false, false],
  );
});

test('a group takes the best member', () => {
  const group = unitsFor({ 'read.markdown-negotiation': 'fail', 'read.markdown-url': 'pass' }).at(-1);
  assert.deepEqual([group.lower, group.upper], [2, 2]);
});

test('a group combines a partial member with an unassessed member', () => {
  const group = unitsFor({ 'read.markdown-negotiation': 'partial', 'read.markdown-url': 'not_assessed' }).at(-1);
  assert.deepEqual([group.lower, group.upper], [1, 2]);
});

test('a legacy member never gives credit to its group', () => {
  const group = unitsFor({
    'read.markdown-negotiation': 'fail',
    'read.markdown-url': 'fail',
    'read.markdown-old-path': 'pass',
  }).at(-1);
  assert.deepEqual([group.lower, group.upper], [0, 0]);
});

test('Watch and Review results never change the units', () => {
  const base = unitsFor({ 'discover.llms-txt': 'pass' });
  const noisy = unitsFor({
    'discover.llms-txt': 'pass',
    'discover.agent-skills': 'pass',
    'discover.llms-full-txt': 'pass',
    'authorize.self-serve-credentials': 'pass',
    'discover.mcp-server-card': 'pass',
  });
  assert.deepEqual(noisy, base);
});
