import { GATE_CAP, GRADE_BANDS, LIMITS, PILLARS, PILLAR_WEIGHT, PROFILES, REGISTRY_VERSION, SCANNER_VERSION, TIER_WEIGHT, pillarOf } from '../model.mjs';
import { bucketOf } from '../scoring/units.mjs';

const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1);
const code = (text) => `\`${text}\``;
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (header, rows) => [row(header), row(header.map(() => '---')), ...rows.map(row)];
const playbookLink = (record) => (record.playbook ? `[${record.playbook}](${record.playbook}.md)` : '');
const specLink = (record) => (record.spec ? `[source](${record.spec})` : '');

const describe = ({ run, ...record }) => record;

function constantsSection() {
  const tiers = Object.entries(TIER_WEIGHT).map(([tier, weight]) => `${tier} ${weight}`);
  const grades = GRADE_BANDS.map((band) => `${band.grade} from ${band.min}`);
  return [
    '## Scoring constants',
    '',
    `- Tier weights in a pillar: ${tiers.join(', ')}.`,
    `- Credit: pass 1, partial 0.5, fail 0.`,
    `- A failed gate limits the score to ${GATE_CAP}.`,
    `- Grades: ${grades.join(', ')}.`,
    `- Request limits: ${LIMITS.requests} requests, ${LIMITS.concurrency} at a time, ${LIMITS.timeoutMs / 1000} s for each request, ${LIMITS.deadlineMs / 1000} s in total.`,
    '',
    '### Pillar weights by profile',
    '',
    ...table(['Pillar', ...PROFILES], PILLARS.map((pillar) => [titleCase(pillar), ...PROFILES.map((profile) => PILLAR_WEIGHT[profile][pillar])])),
  ];
}

function scoreRows(pillar, checks, groups) {
  const inPillar = (record) => pillarOf(record.id) === pillar;
  const scored = checks.filter((check) => inPillar(check) && bucketOf(check, groups) === 'score');
  const standalone = scored
    .filter((check) => !check.group)
    .map((check) => [code(check.id) + (check.gate ? ' (gate)' : ''), check.title, check.tier, check.profiles.join(', '), playbookLink(check)]);
  const grouped = groups.filter(inPillar).flatMap((group) => {
    const members = scored.filter((check) => check.group === group.id);
    if (members.length === 0) return [];
    const head = [`${code(group.id)} (group)`, group.title, group.tier, group.profiles.join(', '), playbookLink(group)];
    return [head, ...members.map((member) => [`- ${code(member.id)}`, member.title, '', '', specLink(member)])];
  });
  return [...standalone, ...grouped];
}

function scoreSection(checks, groups) {
  const sections = PILLARS.flatMap((pillar) => {
    const rows = scoreRows(pillar, checks, groups);
    return rows.length === 0 ? [] : ['', `### ${titleCase(pillar)}`, '', ...table(['ID', 'Check', 'Tier', 'Profiles', 'Fix'], rows)];
  });
  return ['## Score checks', '', 'These checks give the AX Score. A group takes the result of its best member.', ...sections];
}

function reviewSection(checks, groups) {
  const reviewed = checks.filter((check) => bucketOf(check, groups) === 'review');
  const entries = reviewed.flatMap((check) => [
    '',
    `### ${code(check.id)}: ${check.title}`,
    '',
    `Tier: ${check.tier}. Profiles: ${check.profiles.join(', ')}. Fix: ${playbookLink(check)}.`,
    '',
    check.why,
    '',
    `- **Pass:** ${check.rubric.pass}`,
    `- **Partial:** ${check.rubric.partial}`,
    `- **Fail:** ${check.rubric.fail}`,
    `- **Evidence to collect:** ${check.rubric.evidence}`,
  ]);
  return ['## Review checks', '', 'The scanner cannot measure these checks. The agent assesses them with evidence. They do not change the AX Score.', ...entries];
}

function watchSection(checks, groups) {
  const watched = checks.filter((check) => bucketOf(check, groups) === 'watch');
  const rows = watched.map((check) => [code(check.id), check.title, check.stability, check.reviewed ?? '', specLink(check), playbookLink(check)]);
  return [
    '## Watch checks',
    '',
    'These checks are for emerging standards, legacy paths, and observations. They do not change the AX Score.',
    '',
    ...table(['ID', 'Check', 'Standard', 'Reviewed', 'Specification', 'Fix'], rows),
  ];
}

export function renderCatalog(checks, groups) {
  return [
    '# Check catalog',
    '',
    'This file is generated from the check registry. Do not edit it. Run `npm run catalog` to update it.',
    '',
    `Registry version ${REGISTRY_VERSION}. Scanner version ${SCANNER_VERSION}.`,
    '',
    ...constantsSection(),
    '',
    ...scoreSection(checks, groups),
    '',
    ...reviewSection(checks, groups),
    '',
    ...watchSection(checks, groups),
    '',
  ].join('\n');
}

export function catalogData(checks, groups) {
  return {
    registry: REGISTRY_VERSION,
    scanner: SCANNER_VERSION,
    tierWeights: TIER_WEIGHT,
    pillarWeights: PILLAR_WEIGHT,
    gateCap: GATE_CAP,
    groups,
    checks: checks.map((check) => ({ ...describe(check), bucket: bucketOf(check, groups) })),
  };
}
