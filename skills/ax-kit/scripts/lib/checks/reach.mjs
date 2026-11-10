import { transientReason } from '../context/context.mjs';
import { isHtml } from '../context/html.mjs';
import { ALL_PROFILES } from '../model.mjs';
import { challengeSignal } from '../net/challenge.mjs';
import { fail, pass, seen } from './result.mjs';

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
];
