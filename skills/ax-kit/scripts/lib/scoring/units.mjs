import { CREDIT_BOUNDS, TIER_WEIGHT, pillarOf } from '../model.mjs';

const isScoredOwner = (owner) => owner.stability === 'stable' && owner.tier in TIER_WEIGHT;

export function bucketOf(check, groups) {
  if (check.evidence === 'judged') return 'review';
  const owner = check.group ? groups.find((group) => group.id === check.group) : check;
  return isScoredOwner(owner) && check.stability !== 'legacy' ? 'score' : 'watch';
}

const boundsOf = (result) => CREDIT_BOUNDS[result?.status] ?? CREDIT_BOUNDS.not_assessed;

function unitFromCheck(check, result) {
  const [lower, upper] = boundsOf(result);
  return { id: check.id, pillar: pillarOf(check.id), tier: check.tier, gate: Boolean(check.gate), lower, upper };
}

function unitFromGroup(group, members, resultById) {
  const bounds = members.map((member) => boundsOf(resultById.get(member.id)));
  return {
    id: group.id,
    pillar: pillarOf(group.id),
    tier: group.tier,
    gate: false,
    lower: Math.max(...bounds.map(([lower]) => lower)),
    upper: Math.max(...bounds.map(([, upper]) => upper)),
  };
}

export function buildUnits({ checks, groups, results, profile }) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const applies = (record) => record.profiles.includes(profile);

  const scored = checks.filter((check) => bucketOf(check, groups) === 'score');

  const standalone = scored
    .filter((check) => !check.group && applies(check))
    .map((check) => unitFromCheck(check, resultById.get(check.id)));

  const grouped = groups.filter(applies).flatMap((group) => {
    const members = scored.filter((check) => check.group === group.id);
    return members.length > 0 ? [unitFromGroup(group, members, resultById)] : [];
  });

  return [...standalone, ...grouped];
}
