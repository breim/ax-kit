import { OUTPUT_SCHEMA, PILLAR_WEIGHT, REGISTRY_VERSION, SCANNER_VERSION } from '../model.mjs';
import { gateOutcome, scoreUnits } from '../scoring/score.mjs';
import { bucketOf, buildUnits } from '../scoring/units.mjs';

const isApplicable = (entry) => entry.status !== 'not_applicable';

function describeCheck(check, result, groups) {
  return {
    id: check.id,
    bucket: bucketOf(check, groups),
    tier: check.tier,
    stability: check.stability,
    group: check.group ?? null,
    status: result.status,
    reason: result.reason ?? null,
    blockedBy: result.blockedBy ?? null,
    summary: result.summary,
    playbook: check.playbook ?? null,
    evidence: result.evidence,
  };
}

function watchOf(entries) {
  const watched = entries.filter((entry) => entry.bucket === 'watch' && isApplicable(entry));
  const idsWith = (predicate) => watched.filter(predicate).map((entry) => entry.id);
  return {
    adopted: idsWith((entry) => entry.status === 'pass' && entry.stability !== 'legacy'),
    absent: idsWith((entry) => entry.status === 'fail' && entry.stability !== 'legacy'),
    legacyFound: idsWith((entry) => entry.status === 'pass' && entry.stability === 'legacy'),
    observations: idsWith((entry) => entry.status === 'info' || entry.status === 'partial'),
  };
}

function coverageOf(scoring, entries) {
  const reviewable = entries.filter((entry) => entry.bucket === 'review' && isApplicable(entry));
  return {
    percent: scoring.coverage,
    notAssessed: entries
      .filter((entry) => entry.bucket === 'score' && entry.status === 'not_assessed')
      .map((entry) => entry.id),
    reviewed: 0,
    reviewable: reviewable.length,
  };
}

const gateOf = (scoring, minScore) => {
  if (minScore === null) return null;
  return { minScore, outcome: scoring.score === null ? 'no_score' : gateOutcome(scoring, minScore) };
};

export function buildReport({ target, profile, checks, groups, results, requests, minScore = null }) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const entries = checks.map((check) => describeCheck(check, resultById.get(check.id), groups));
  const units = buildUnits({ checks, groups, results, profile: profile.value });
  const scoring = scoreUnits(units, PILLAR_WEIGHT[profile.value]);

  return {
    schema: OUTPUT_SCHEMA,
    scanner: SCANNER_VERSION,
    registry: REGISTRY_VERSION,
    target,
    profile,
    score: scoring.score,
    upperBound: scoring.upperBound,
    grade: scoring.grade,
    cap: scoring.cap,
    coverage: coverageOf(scoring, entries),
    gate: gateOf(scoring, minScore),
    pillars: scoring.pillars,
    opportunities: scoring.opportunities,
    review: entries.filter((entry) => entry.bucket === 'review' && isApplicable(entry)).map((entry) => entry.id),
    watch: watchOf(entries),
    checks: entries,
    requests,
  };
}
