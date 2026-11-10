import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PILLARS, PROFILES, TIER_WEIGHT } from '../skills/ax-kit/scripts/lib/model.mjs';
import { CHECKS, GROUPS } from '../skills/ax-kit/scripts/lib/registry.mjs';

const TIERS = [...Object.keys(TIER_WEIGHT), 'info'];
const STABILITIES = ['stable', 'emerging', 'legacy'];
const ID = /^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/;
const REVIEWED = /^\d{4}-\d{2}$/;
const RUBRIC_FIELDS = ['pass', 'partial', 'fail', 'evidence'];

const records = [...CHECKS, ...GROUPS];
const groupIds = new Set(GROUPS.map((group) => group.id));
const each = (list, assertion) => list.forEach((record) => assertion(record, record.id));

test('each id is unique and starts with a pillar', () => {
  const ids = records.map((record) => record.id);
  assert.deepEqual(ids, [...new Set(ids)]);
  each(records, (record, id) => {
    assert.match(id, ID);
    assert.ok(PILLARS.includes(id.split('.')[0]), id);
  });
});

test('each record has a title, a reason, a valid tier, a valid status, and valid profiles', () => {
  each(records, (record, id) => {
    assert.ok(record.title?.length > 10, `${id} title`);
    assert.ok(record.why?.length > 20, `${id} why`);
    assert.ok(TIERS.includes(record.tier), `${id} tier`);
    assert.ok(STABILITIES.includes(record.stability), `${id} stability`);
    assert.ok(record.profiles.length > 0 && record.profiles.every((profile) => PROFILES.includes(profile)), `${id} profiles`);
  });
});

test('each record points to a playbook', () => {
  each(records, (record, id) => assert.match(record.playbook ?? '', /^[a-z]+(-[a-z]+)*$/, `${id} playbook`));
});

test('a measured check has a run function and a specification link', () => {
  each(CHECKS.filter((check) => check.evidence === 'measured'), (check, id) => {
    assert.equal(typeof check.run, 'function', `${id} run`);
    assert.match(check.spec ?? '', /^https:\/\//, `${id} spec`);
    assert.equal(check.rubric, undefined, `${id} rubric`);
  });
});

test('a judged check has a rubric and no run function', () => {
  each(CHECKS.filter((check) => check.evidence !== 'measured'), (check, id) => {
    assert.equal(check.evidence, 'judged', id);
    assert.equal(check.run, undefined, `${id} run`);
    assert.equal(check.group, undefined, `${id} group`);
    for (const field of RUBRIC_FIELDS) assert.ok(check.rubric?.[field]?.length > 10, `${id} rubric.${field}`);
  });
});

test('a group reference points to a group, and each group has a member', () => {
  each(CHECKS.filter((check) => check.group), (check, id) => assert.ok(groupIds.has(check.group), id));
  each(GROUPS, (group, id) => assert.ok(CHECKS.some((check) => check.group === id), `${id} has no member`));
});

test('a stable group has a stable member, and a group has no legacy tier', () => {
  each(GROUPS.filter((group) => group.stability === 'stable'), (group, id) => {
    assert.ok(CHECKS.some((check) => check.group === id && check.stability === 'stable'), id);
  });
  each(GROUPS, (group, id) => assert.notEqual(group.stability, 'legacy', id));
});

test('an emerging or legacy check has a review date', () => {
  each(CHECKS.filter((check) => check.stability !== 'stable'), (check, id) => assert.match(check.reviewed ?? '', REVIEWED, id));
});

test('a legacy check is informational and names its replacement', () => {
  each(CHECKS.filter((check) => check.stability === 'legacy'), (check, id) => {
    assert.equal(check.tier, 'info', id);
    assert.ok(CHECKS.some((other) => other.id === check.supersededBy), `${id} supersededBy`);
  });
});

test('a gate is an essential, stable, measured check outside a group', () => {
  each(CHECKS.filter((check) => check.gate), (check, id) => {
    assert.deepEqual([check.tier, check.stability, check.evidence, check.group], ['essential', 'stable', 'measured', undefined], id);
  });
});
