import { loadRfc8414 } from '../context/oauth.mjs';
import { toHttpUrl } from '../context/url.mjs';
import { API_PROFILES } from '../model.mjs';
import { fail, pass, seen } from './result.mjs';

const firstLineOf = (text) => text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';

const isAuthMd = (snapshot) => snapshot.status === 200 && /^#\s+\S/.test(firstLineOf(snapshot.body));

async function authMdUrls(ctx) {
  const server = await loadRfc8414(ctx);
  const skill = server.matches ? toHttpUrl(server.document.agent_auth?.skill)?.href : null;
  return new Set([skill, ctx.at('/auth.md')].filter(Boolean));
}

async function runAuthMd(ctx) {
  const evidence = [];
  for (const url of await authMdUrls(ctx)) {
    const snapshot = await ctx.get(url);
    evidence.push(seen(snapshot, isAuthMd(snapshot) ? 'Markdown file with a title' : 'no Markdown file with a title'));
    if (isAuthMd(snapshot)) return pass(`An auth.md file is at ${url}.`, evidence);
  }
  return fail('No auth.md file with an H1 title was found at the service root.', evidence);
}

export const accessChecks = [
  {
    id: 'authorize.auth-md',
    title: 'An auth.md file tells an agent how to register',
    why: 'One Markdown file gives an agent the registration steps, so the agent does not search the documentation.',
    tier: 'recommended',
    stability: 'emerging',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: 'https://workos.com/auth-md/docs/auth-md',
    playbook: 'self-serve-access',
    reviewed: '2026-11',
    run: runAuthMd,
  },
  {
    id: 'authorize.self-serve-credentials',
    title: 'An agent can get working credentials with no human step',
    why: 'An agent cannot solve a CAPTCHA, read a verification email, or join a sales call, so each manual step stops it.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'judged',
    profiles: API_PROFILES,
    playbook: 'self-serve-access',
    rubric: {
      pass: 'An agent gets working credentials through an API, a CLI, or OAuth with automatic client registration. The flow has no CAPTCHA, no email or phone verification that needs a person, and no sales call.',
      partial: 'An agent can create keys or tokens through an API or a CLI. A person must first complete one step, for example the signup or an email verification.',
      fail: 'A person must use a dashboard, solve a CAPTCHA, or speak to a sales team before a credential exists.',
      evidence: 'Read the signup and authentication documentation. Record each step from no account to a working credential. Mark each step that needs a person. Do not create an account on a live site unless the owner approves it.',
    },
  },
  {
    id: 'authorize.sandbox',
    title: 'A sandbox or a test mode lets an agent try a write with no real effect',
    why: 'An agent must try a write operation before it changes real data, because no human is there to undo an error.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'judged',
    profiles: API_PROFILES,
    playbook: 'self-serve-access',
    rubric: {
      pass: 'The documentation describes a test mode or a sandbox with test credentials. An agent can get the test credentials with no human step, and a write in that mode has no real effect.',
      partial: 'A sandbox or a test mode exists, but a person must request access to it, or it does not support the write operations.',
      fail: 'The product has no test mode and no sandbox, so each write changes real data.',
      evidence: 'Search the documentation for "sandbox", "test mode", and "test key". Record how an agent gets test credentials and which operations the sandbox supports.',
    },
  },
];
