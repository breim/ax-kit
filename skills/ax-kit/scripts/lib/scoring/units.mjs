import { CREDIT_BOUNDS, TIER_WEIGHT, pillarOf } from '../model.mjs';

const isScoredTier = (tier) => tier in TIER_WEIGHT;

const isScoredCheck = (check) =>
  !check.group && check.evidence === 'measured' && check.stability === 'stable' && isScoredTier(check.tier);

const isScoredGroup = (group) => group.stability === 'stable' && isScoredTier(group.tier);

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

  const standalone = checks
    .filter((check) => isScoredCheck(check) && applies(check))
    .map((check) => unitFromCheck(check, resultById.get(check.id)));

  const grouped = groups
    .filter((group) => isScoredGroup(group) && applies(group))
    .map((group) => {
      const members = checks.filter((check) => check.group === group.id && check.stability !== 'legacy');
      return unitFromGroup(group, members, resultById);
    });

  return [...standalone, ...grouped];
}
