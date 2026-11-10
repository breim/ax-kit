import { FULL_CREDIT, GATE_CAP, GRADE_BANDS, TIER_WEIGHT } from '../model.mjs';

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

function fraction(numerator, denominator) {
  const divisor = gcd(numerator, denominator) || 1;
  return { n: numerator / divisor, d: denominator / divisor };
}

const ZERO = fraction(0, 1);
const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const subtract = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const floorOf = (value) => (value.n - (value.n % value.d)) / value.d;
const exceeds = (value, limit) => value.n > limit * value.d;
const capAt = (value, limit) => (exceeds(value, limit) ? fraction(limit, 1) : value);
const toNumber = (value) => Math.round((value.n / value.d) * 100) / 100;

const weightOf = (unit) => TIER_WEIGHT[unit.tier];

function pillarTotals(units) {
  const possible = units.reduce((sum, unit) => sum + weightOf(unit), 0);
  const earned = (side) => units.reduce((sum, unit) => sum + weightOf(unit) * unit[side], 0);
  return { possible, lower: earned('lower'), upper: earned('upper') };
}

function scorePillar(id, weight, units) {
  const totals = pillarTotals(units);
  const denominator = totals.possible * FULL_CREDIT;
  if (denominator === 0) return { id, weight, units, totals, lower: ZERO, upper: ZERO };
  return {
    id,
    weight,
    units,
    totals,
    lower: fraction(weight * totals.lower, denominator),
    upper: fraction(weight * totals.upper, denominator),
  };
}

function scorePillars(units, pillarWeights) {
  return Object.entries(pillarWeights)
    .filter(([, weight]) => weight > 0)
    .map(([id, weight]) => scorePillar(id, weight, units.filter((unit) => unit.pillar === id)));
}

function opportunitiesOf(pillars) {
  return pillars
    .flatMap((pillar) =>
      pillar.units
        .filter((unit) => unit.lower < FULL_CREDIT)
        .map((unit) => ({
          id: unit.id,
          points: toNumber(
            fraction(pillar.weight * weightOf(unit) * (FULL_CREDIT - unit.lower), pillar.totals.possible * FULL_CREDIT),
          ),
        })),
    )
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

export const gradeOf = (score) => GRADE_BANDS.find((band) => score >= band.min).grade;

const isUnassessed = (unit) => unit.lower === 0 && unit.upper === FULL_CREDIT;
const isFailed = (unit) => unit.upper === 0;

function pillarReport(pillar) {
  return {
    id: pillar.id,
    weight: pillar.weight,
    points: toNumber(pillar.lower),
    upperPoints: toNumber(pillar.upper),
  };
}

export function scoreUnits(units, pillarWeights) {
  const pillars = scorePillars(units, pillarWeights);
  const report = { pillars: pillars.map(pillarReport), opportunities: opportunitiesOf(pillars) };
  const gates = units.filter((unit) => unit.gate);
  const failedGates = gates.filter(isFailed).map((unit) => unit.id);
  const capped = failedGates.length > 0;

  // A failed gate decides the cap. Only when no gate failed does an unassessed gate leave the score open.
  if (!capped && gates.some(isUnassessed)) {
    return { score: null, upperBound: null, coverage: null, grade: null, cap: null, ...report };
  }

  const rawLower = pillars.reduce((sum, pillar) => add(sum, pillar.lower), ZERO);
  const rawUpper = pillars.reduce((sum, pillar) => add(sum, pillar.upper), ZERO);

  const score = floorOf(capped ? capAt(rawLower, GATE_CAP) : rawLower);
  const upperBound = floorOf(capped ? capAt(rawUpper, GATE_CAP) : rawUpper);
  const coverage = floorOf(subtract(fraction(100, 1), subtract(rawUpper, rawLower)));
  const grade = gradeOf(score) === gradeOf(upperBound) ? gradeOf(score) : null;
  const cap = capped ? { limit: GATE_CAP, by: failedGates, uncapped: floorOf(rawLower) } : null;

  return { score, upperBound, coverage, grade, cap, ...report };
}

export function gateOutcome({ score, upperBound }, minScore) {
  if (score >= minScore) return 'pass';
  if (upperBound < minScore) return 'fail';
  return 'inconclusive';
}
