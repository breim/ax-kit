import { AI_AGENT_TOKENS, USER_DIRECTED_TOKENS, WILDCARD_AGENT, blockedOn, entryPathOf } from '../context/ai-agents.mjs';
import { transientReason } from '../context/context.mjs';
import { isHtml } from '../context/html.mjs';
import { loadRobots } from '../context/robots.mjs';
import { ALL_PROFILES, PAGE_PROFILES } from '../model.mjs';
import { challengeSignal } from '../net/challenge.mjs';
import { watchChecks } from './reach-watch.mjs';
import { blocked, fail, partial, pass, seen } from './result.mjs';

const ACCESS_SUBJECTS = [...USER_DIRECTED_TOKENS, WILDCARD_AGENT];
const POLICY_DIRECTIVES = ['Content-Signal', 'Content-Usage'];
const ROBOTS_SPEC = 'https://www.rfc-editor.org/rfc/rfc9309';

const isSuccess = (status) => status >= 200 && status < 300;

const notAssessed = (reason, summary, evidence) => ({ status: 'not_assessed', reason, summary, evidence });

async function runPlainFetch(ctx) {
  const entry = await ctx.entry();
  const challenge = entry.error ? null : challengeSignal(entry, isHtml(entry));
  const evidence = [seen(entry, challenge ?? entry.error ?? `HTTP ${entry.status}`)];

  if (challenge) return fail(`A plain request is blocked: ${challenge}.`, evidence);
  const transient = transientReason(entry);
  if (transient) return notAssessed(transient, 'The entry URL gave no usable response.', evidence);
  if (entry.error) return notAssessed('network', `The entry URL cannot be requested: ${entry.error}.`, evidence);
  if (isSuccess(entry.status)) return pass('A plain request gets the entry URL with no challenge.', evidence);
  if (ctx.profile === 'api') return pass(`The API answers a plain request with HTTP ${entry.status}.`, evidence);
  return notAssessed('entry_status', `The entry URL returns HTTP ${entry.status}. Give the URL of a page that exists.`, evidence);
}

function missingRobotsSummary(snapshot) {
  if (snapshot.status !== 200) return 'No robots.txt file is at the site root.';
  if (isHtml(snapshot)) return 'The robots.txt path returns an HTML page and not a robots.txt file.';
  return 'The robots.txt file has no User-agent group.';
}

async function runRobotsTxt(ctx) {
  const robots = await loadRobots(ctx);
  const evidence = [seen(robots.snapshot, robots.found ? `${robots.groups.length} User-agent groups` : 'no robots.txt rules')];
  if (!robots.found) return fail(missingRobotsSummary(robots.snapshot), evidence);
  if (isHtml(robots.snapshot)) return partial('robots.txt has rules, but the server sends it as HTML.', evidence);
  return pass('robots.txt is a text file with one User-agent group or more.', evidence);
}

const subjectLabel = (subject) => (subject === WILDCARD_AGENT ? 'all other agents (*)' : subject);

async function runUserAgentsAllowed(ctx) {
  const robots = await loadRobots(ctx);
  const stopped = blockedOn(robots, ACCESS_SUBJECTS, entryPathOf(ctx)).map(subjectLabel);
  const evidence = [seen(robots.snapshot, stopped.length > 0 ? `blocked: ${stopped.join(', ')}` : 'no block')];
  if (!robots.found) return pass('No robots.txt rule restricts user-directed agents.', evidence);
  if (stopped.length === 0) return pass('robots.txt allows each user-directed agent on the entry path.', evidence);
  const summary = `robots.txt blocks these agents on the entry path: ${stopped.join(', ')}.`;
  return stopped.length === ACCESS_SUBJECTS.length ? fail(summary, evidence) : partial(summary, evidence);
}

const directiveStatement = (directives) =>
  directives.length === 1 ? `it has a ${directives[0]} directive` : `it has ${directives.join(' and ')} directives`;

function policyOf(robots) {
  const named = AI_AGENT_TOKENS.filter((token) => robots.hasGroupFor(token));
  const directives = POLICY_DIRECTIVES.filter((name) => robots.directive(name.toLowerCase()).length > 0);
  const statements = [
    ...(named.length > 0 ? [`it names ${named.length} of the known AI client tokens`] : []),
    ...(directives.length > 0 ? [directiveStatement(directives)] : []),
  ];
  return { statements, observed: [...named, ...directives].join(', ') };
}

async function runBotPolicyExplicit(ctx) {
  const robots = await loadRobots(ctx);
  if (!robots.found) return blocked('reach.robots-txt', 'robots.txt is missing, so the site states no policy for AI agents.');
  const { statements, observed } = policyOf(robots);
  const evidence = [seen(robots.snapshot, observed || 'no AI policy')];
  if (statements.length === 0) {
    return partial('robots.txt names no AI agent and has no Content-Signal or Content-Usage directive.', evidence);
  }
  return pass(`robots.txt states a policy for AI agents: ${statements.join(', and ')}.`, evidence);
}

export const groups = [];

export const checks = [
  {
    id: 'reach.plain-fetch',
    title: 'A plain request reaches the site with no bot challenge',
    why: 'An agent that gets a challenge page or a CAPTCHA cannot continue, because no human is there to solve it.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    gate: true,
    spec: 'https://www.rfc-editor.org/rfc/rfc9110',
    playbook: 'bot-access',
    run: runPlainFetch,
  },
  {
    id: 'reach.robots-txt',
    title: 'A robots.txt file gives rules to crawlers and agents',
    why: 'An agent reads robots.txt first, to learn what the owner permits before it requests a page.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: ROBOTS_SPEC,
    playbook: 'bot-access',
    run: runRobotsTxt,
  },
  {
    id: 'reach.user-agents-allowed',
    title: 'robots.txt allows user-directed agents on the entry page',
    why: 'An agent that a person sent to a page stops when robots.txt blocks its token, and the person gets no answer.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: ROBOTS_SPEC,
    playbook: 'bot-access',
    run: runUserAgentsAllowed,
  },
  {
    id: 'reach.bot-policy-explicit',
    title: 'robots.txt states an explicit policy for AI agents',
    why: 'An agent with no explicit rule must guess what the owner permits, and different agents guess differently.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: ROBOTS_SPEC,
    playbook: 'bot-access',
    run: runBotPolicyExplicit,
  },
  {
    id: 'reach.verified-agents',
    title: 'The bot protection lets verified agents through with no CAPTCHA',
    why: 'An agent cannot solve a CAPTCHA, so the bot protection must identify a legitimate agent by a different method.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'judged',
    profiles: PAGE_PROFILES,
    playbook: 'bot-access',
    rubric: {
      pass: 'The CDN or the WAF verifies agents by a Web Bot Auth signature or by a vendor list of verified bots. A verified agent gets the page with no challenge.',
      partial: 'An allow rule exists, but it matches only the user-agent string, or it does not include each agent that the owner permits.',
      fail: 'The bot protection challenges or blocks each automated client, and it has no rule for verified agents.',
      evidence: 'The bot settings of the CDN or the WAF, the rule that allows verified agents, and the log of one verified request.',
    },
  },
  ...watchChecks,
];
