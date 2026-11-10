import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CREDIT_BOUNDS } from '../../skills/ax-kit/scripts/lib/model.mjs';
import { gateOutcome, gradeOf, scoreUnits } from '../../skills/ax-kit/scripts/lib/scoring/score.mjs';

const unit = (id, tier, status, gate = false) => {
  const [lower, upper] = CREDIT_BOUNDS[status];
  return { id, pillar: id.split('.')[0], tier, gate, lower, upper };
};

const withStatus = (units, id, status) =>
  units.map((entry) => (entry.id === id ? unit(id, entry.tier, status, entry.gate) : entry));

const CONTENT_WEIGHTS = { reach: 20, discover: 30, read: 40, recover: 10 };

const contentSite = () => [
  unit('reach.plain-fetch', 'essential', 'pass', true),
  unit('reach.bot-policy-explicit', 'recommended', 'partial'),
  unit('discover.robots-txt', 'essential', 'pass'),
  unit('discover.sitemap', 'recommended', 'pass'),
  unit('discover.llms-txt', 'recommended', 'fail'),
  unit('discover.link-headers', 'optional', 'fail'),
  unit('read.content-without-js', 'essential', 'pass', true),
  unit('read.markdown', 'recommended', 'pass'),
  unit('read.structured-data', 'recommended', 'partial'),
  unit('read.page-weight', 'optional', 'pass'),
  unit('recover.honest-404', 'essential', 'pass'),
];

const API_WEIGHTS = { reach: 10, discover: 15, read: 10, act: 30, authorize: 20, recover: 15 };

const apiSite = () => [
  unit('reach.plain-fetch', 'essential', 'pass', true),
  unit('discover.api-description', 'essential', 'pass'),
  unit('discover.llms-txt', 'recommended', 'fail'),
  { id: 'read.markdown', pillar: 'read', tier: 'recommended', gate: false, lower: 1, upper: 2 },
  unit('act.openapi-valid', 'essential', 'pass'),
  unit('act.openapi-operation-ids', 'recommended', 'partial'),
  unit('act.openapi-descriptions', 'recommended', 'pass'),
  unit('act.openapi-security-schemes', 'recommended', 'pass'),
  unit('act.openapi-examples', 'optional', 'fail'),
  unit('authorize.server-metadata', 'essential', 'pass'),
  unit('authorize.protected-resource-metadata', 'recommended', 'fail'),
  unit('authorize.pkce-s256', 'recommended', 'pass'),
  unit('authorize.client-registration', 'recommended', 'pass'),
  unit('authorize.headless-grant', 'recommended', 'fail'),
  unit('recover.honest-404', 'essential', 'pass'),
  unit('recover.structured-errors', 'recommended', 'partial'),
];

test('content site scores 82 with grade B and full coverage', () => {
  const result = scoreUnits(contentSite(), CONTENT_WEIGHTS);
  assert.equal(result.score, 82);
  assert.equal(result.upperBound, 82);
  assert.equal(result.coverage, 100);
  assert.equal(result.grade, 'B');
  assert.equal(result.cap, null);
});

test('content site pillar points follow the tier weights', () => {
  const { pillars } = scoreUnits(contentSite(), CONTENT_WEIGHTS);
  assert.deepEqual(pillars, [
    { id: 'reach', weight: 20, points: 16.67, upperPoints: 16.67 },
    { id: 'discover', weight: 30, points: 20, upperPoints: 20 },
    { id: 'read', weight: 40, points: 35.56, upperPoints: 35.56 },
    { id: 'recover', weight: 10, points: 10, upperPoints: 10 },
  ]);
});

test('a passing llms.txt lifts the content site to 88', () => {
  const result = scoreUnits(withStatus(contentSite(), 'discover.llms-txt', 'pass'), CONTENT_WEIGHTS);
  assert.equal(result.score, 88);
});

test('a failed gate caps the score at 59 and gives grade F', () => {
  const spa = withStatus(contentSite(), 'read.content-without-js', 'fail');
  const result = scoreUnits(spa, CONTENT_WEIGHTS);
  assert.equal(result.score, 59);
  assert.equal(result.upperBound, 59);
  assert.equal(result.grade, 'F');
  assert.deepEqual(result.cap, { limit: 59, by: ['read.content-without-js'], uncapped: 64 });
});

test('the cap is recorded but does not lift a score that is already below it', () => {
  const spa = withStatus(contentSite(), 'read.content-without-js', 'fail');
  const result = scoreUnits(withStatus(spa, 'discover.robots-txt', 'fail'), CONTENT_WEIGHTS);
  assert.equal(result.score, 51);
  assert.equal(result.cap.uncapped, 51);
});

test('a partial gate result does not cap the score', () => {
  const result = scoreUnits(withStatus(contentSite(), 'read.content-without-js', 'partial'), CONTENT_WEIGHTS);
  assert.equal(result.cap, null);
  assert.equal(result.score, 73);
});

test('api site reports a lower bound, an upper bound, and withholds the grade', () => {
  const result = scoreUnits(apiSite(), API_WEIGHTS);
  assert.equal(result.score, 75);
  assert.equal(result.upperBound, 80);
  assert.equal(result.coverage, 95);
  assert.equal(result.grade, null);
});

test('a resolved check moves the api site to one band', () => {
  const settle = (lower) =>
    apiSite().map((entry) => (entry.id === 'read.markdown' ? { ...entry, lower, upper: lower } : entry));
  const passed = scoreUnits(settle(2), API_WEIGHTS);
  const failed = scoreUnits(settle(1), API_WEIGHTS);
  assert.deepEqual([passed.score, passed.grade, passed.coverage], [80, 'B', 100]);
  assert.deepEqual([failed.score, failed.grade, failed.coverage], [75, 'C', 100]);
});

test('a failed group lowers the api site to 72', () => {
  const result = scoreUnits(withStatus(apiSite(), 'authorize.client-registration', 'fail'), API_WEIGHTS);
  assert.equal(result.score, 72);
});

test('a failed reach gate caps both bounds of the api site', () => {
  const result = scoreUnits(withStatus(apiSite(), 'reach.plain-fetch', 'fail'), API_WEIGHTS);
  assert.equal(result.score, 59);
  assert.equal(result.upperBound, 59);
  assert.equal(result.grade, 'F');
  assert.equal(result.cap.uncapped, 65);
});

test('an unassessed gate gives no score', () => {
  const result = scoreUnits(withStatus(apiSite(), 'reach.plain-fetch', 'not_assessed'), API_WEIGHTS);
  assert.equal(result.score, null);
  assert.equal(result.upperBound, null);
  assert.equal(result.grade, null);
});

test('coverage rounds down', () => {
  const units = [
    unit('recover.a', 'essential', 'pass'),
    unit('recover.b', 'recommended', 'not_assessed'),
    unit('recover.c', 'recommended', 'pass'),
  ];
  const result = scoreUnits(units, { recover: 15 });
  assert.equal(result.coverage, 96);
});

test('opportunities list the points that each failing unit can add, largest first', () => {
  const { opportunities } = scoreUnits(contentSite(), CONTENT_WEIGHTS);
  assert.deepEqual(opportunities, [
    { id: 'discover.llms-txt', points: 6.67 },
    { id: 'read.structured-data', points: 4.44 },
    { id: 'discover.link-headers', points: 3.33 },
    { id: 'reach.bot-policy-explicit', points: 3.33 },
  ]);
});

test('a pillar with weight zero is ignored', () => {
  const base = scoreUnits(contentSite(), CONTENT_WEIGHTS);
  const extra = scoreUnits([...contentSite(), unit('act.openapi-valid', 'essential', 'fail')], {
    ...CONTENT_WEIGHTS,
    act: 0,
  });
  assert.equal(extra.score, base.score);
});

test('a worse result never raises the score', () => {
  const order = ['pass', 'partial', 'fail'];
  for (const entry of contentSite()) {
    const scores = order.map((status) => scoreUnits(withStatus(contentSite(), entry.id, status), CONTENT_WEIGHTS).score);
    assert.ok(scores[0] >= scores[1] && scores[1] >= scores[2], `${entry.id}: ${scores}`);
  }
});

test('grade bands change at 60, 70, 80, and 90', () => {
  assert.deepEqual([59, 60, 69, 70, 79, 80, 89, 90, 100].map(gradeOf), ['F', 'D', 'D', 'C', 'C', 'B', 'B', 'A', 'A']);
});

test('the CI gate passes on the score, fails on the upper bound, and is inconclusive between them', () => {
  const bounds = { score: 75, upperBound: 80 };
  assert.deepEqual(
    [75, 76, 80, 81].map((minimum) => gateOutcome(bounds, minimum)),
    ['pass', 'inconclusive', 'inconclusive', 'fail'],
  );
});
