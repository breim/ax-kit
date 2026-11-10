import { TRAINING_CRAWLERS, USER_DIRECTED_AGENTS, blockedOn, entryPathOf } from '../context/ai-agents.mjs';
import { CONTENT_SIGNAL, CONTENT_USAGE, formatPreferences, statedPreferences } from '../context/content-preferences.mjs';
import { loadRobots } from '../context/robots.mjs';
import { PAGE_PROFILES, USER_AGENT } from '../model.mjs';
import { blocked, fail, info, partial, pass, seen } from './result.mjs';

const BRANDED_AGENT_LIMIT = 2;
const BRANDED_AGENTS = USER_DIRECTED_AGENTS.filter((agent) => agent.userAgent).slice(0, BRANDED_AGENT_LIMIT);

const SPEC = {
  robots: 'https://www.rfc-editor.org/rfc/rfc9309',
  http: 'https://www.rfc-editor.org/rfc/rfc9110',
  contentSignals: 'https://contentsignals.org/',
  aipref: 'https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/',
};

async function runContentSignals(ctx) {
  const robots = await loadRobots(ctx);
  if (!robots.found) return blocked('reach.robots-txt', 'robots.txt is missing, so the site declares no Content Signals.');
  const directives = robots.directive('content-signal');
  const [stated] = statedPreferences(directives, CONTENT_SIGNAL);
  const evidence = [seen(robots.snapshot, stated ? formatPreferences(stated) : `${directives.length} Content-Signal directives`)];
  if (directives.length === 0) return fail('robots.txt has no Content-Signal directive.', evidence);
  if (!stated) return partial('The Content-Signal directive has no valid search, ai-input, or ai-train signal.', evidence);
  return pass(`robots.txt declares Content Signals: ${formatPreferences(stated)}.`, evidence);
}

async function runAipref(ctx) {
  const robots = await loadRobots(ctx);
  const entry = await ctx.get(ctx.entryUrl);
  const sources = {
    'robots.txt': robots.directive('content-usage'),
    'the entry response': [entry.headers['content-usage']].filter(Boolean),
  };
  const declared = Object.keys(sources).filter((name) => sources[name].length > 0);
  const valid = declared.filter((name) => statedPreferences(sources[name], CONTENT_USAGE).length > 0);
  const evidence = [
    seen(robots.snapshot, `${sources['robots.txt'].length} Content-Usage rules`),
    seen(entry, entry.headers['content-usage'] ?? 'no Content-Usage header'),
  ];
  if (declared.length === 0) return fail('No Content-Usage rule is in robots.txt, and the entry response has no Content-Usage header.', evidence);
  if (valid.length === 0) return partial('Content-Usage has no valid train-ai, ai-use, or search preference.', evidence);
  return pass(`Content-Usage declares AI usage preferences in ${valid.join(' and in ')}.`, evidence);
}

const listOf = (tokens) => (tokens.length > 0 ? tokens.join(', ') : 'none');

async function runTrainingCrawlerPolicy(ctx) {
  const robots = await loadRobots(ctx);
  const stopped = blockedOn(robots, TRAINING_CRAWLERS, entryPathOf(ctx));
  const allowed = TRAINING_CRAWLERS.filter((token) => !stopped.includes(token));
  const evidence = [seen(robots.snapshot, `blocked: ${listOf(stopped)}; allowed: ${listOf(allowed)}`)];
  if (!robots.found) return info('No robots.txt rule restricts an AI training crawler.', evidence);
  return info(`For AI training crawlers, robots.txt blocks ${listOf(stopped)} and allows ${listOf(allowed)}.`, evidence);
}

const statusLabel = (snapshot) => (snapshot.error ? `no response (${snapshot.error})` : `HTTP ${snapshot.status}`);

const fetchAs = (ctx, agent) => ctx.fetch(ctx.entryUrl, { headers: { 'user-agent': `${agent.userAgent} ${USER_AGENT}` } });

async function runBrandedAgentFetch(ctx) {
  const plain = await ctx.entry();
  const snapshots = await Promise.all(BRANDED_AGENTS.map((agent) => fetchAs(ctx, agent)));
  const tokens = BRANDED_AGENTS.map((agent) => agent.token);
  const results = snapshots.map((snapshot, index) => `${statusLabel(snapshot)} for ${tokens[index]}`);
  const evidence = [seen(plain, 'plain request'), ...snapshots.map((snapshot, index) => seen(snapshot, tokens[index]))];
  const same = snapshots.every((snapshot) => statusLabel(snapshot) === statusLabel(plain));
  const summary = same
    ? `The entry URL gives ${statusLabel(plain)} for a plain request and for the user-agent strings of ${tokens.join(' and ')}.`
    : `The entry URL gives ${statusLabel(plain)} for a plain request, but ${results.join(' and ')}.`;
  return info(summary, evidence);
}

export const watchChecks = [
  {
    id: 'reach.content-signals',
    title: 'robots.txt declares Content Signals',
    why: 'Content Signals tell an agent which uses the owner permits: search, input to an AI answer, or AI training.',
    tier: 'recommended',
    stability: 'emerging',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.contentSignals,
    playbook: 'bot-access',
    reviewed: '2026-11',
    run: runContentSignals,
  },
  {
    id: 'reach.aipref',
    title: 'The site declares AI usage preferences with Content-Usage',
    why: 'The IETF AIPREF vocabulary gives an agent one standard statement of the permitted uses, for each response or path.',
    tier: 'recommended',
    stability: 'emerging',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.aipref,
    playbook: 'bot-access',
    reviewed: '2026-11',
    run: runAipref,
  },
  {
    id: 'reach.training-crawler-policy',
    title: 'robots.txt sets the access of AI training crawlers',
    why: 'This observation shows the decision of the owner on AI training. A block on training is a valid decision.',
    tier: 'info',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.robots,
    playbook: 'bot-access',
    run: runTrainingCrawlerPolicy,
  },
  {
    id: 'reach.branded-agent-fetch',
    title: 'The user-agent string of a user-directed agent gets the same status as a plain request',
    why: 'A rule on the user-agent string can stop an agent before it reads the page. A block can also be correct verification of the vendor IP ranges.',
    tier: 'info',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.http,
    playbook: 'bot-access',
    run: runBrandedAgentFetch,
  },
];
