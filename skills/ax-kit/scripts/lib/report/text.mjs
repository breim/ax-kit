const TOP_GAPS = 8;

const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1);

function headline(report) {
  if (report.score === null) return 'AX Score  no score: the entry URL gave no usable response';
  const grade = report.grade ? `grade ${report.grade}` : 'grade withheld';
  return `AX Score  ${report.score} / 100   ${grade}   (upper bound ${report.upperBound}, coverage ${report.coverage.percent}%)`;
}

const capLine = (report) =>
  report.cap ? [`Cap       ${report.cap.limit}, because of ${report.cap.by.join(', ')} (uncapped: ${report.cap.uncapped})`] : [];

const gateLine = (report) => (report.gate ? [`CI gate   minimum ${report.gate.minScore}: ${report.gate.outcome}`] : []);

const pillarStrip = (report) =>
  report.pillars.map((pillar) => `${titleCase(pillar.id)} ${pillar.points}/${pillar.weight}`).join('  >  ');

function gapLines(report) {
  const byId = new Map(report.checks.map((check) => [check.id, check]));
  const describe = (id) => byId.get(id) ?? report.checks.find((check) => check.group === id);
  return report.opportunities.slice(0, TOP_GAPS).map((gap) => {
    const check = describe(gap.id);
    const playbook = check?.playbook ? `  [references/${check.playbook}.md]` : '';
    return `  +${gap.points.toFixed(2).padStart(5)}  ${gap.id}${playbook}`;
  });
}

const listLine = (label, ids) => (ids.length > 0 ? [`${label}${ids.join(', ')}`] : []);

export function renderText(report) {
  return [
    headline(report),
    `Target    ${report.target.entry}`,
    `Profile   ${report.profile.value} (${report.profile.source})`,
    ...capLine(report),
    ...gateLine(report),
    '',
    `Pillars   ${pillarStrip(report)}`,
    '',
    'Top gaps (points that each fix can add)',
    ...(report.opportunities.length > 0 ? gapLines(report) : ['  none']),
    '',
    ...listLine('Not assessed: ', report.coverage.notAssessed),
    ...listLine('Review (needs judgment, not scored): ', report.review),
    ...listLine('Watch, adopted: ', report.watch.adopted),
    ...listLine('Watch, partly adopted: ', report.watch.partial),
    ...listLine('Watch, absent: ', report.watch.absent),
    ...listLine('Watch, legacy path found: ', report.watch.legacyFound),
    `Requests  ${report.requests.made} of ${report.requests.budget}`,
  ].join('\n');
}
