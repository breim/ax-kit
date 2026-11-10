import { loadApiError } from '../context/api-error.mjs';
import { loadMissingPage } from '../context/missing-page.mjs';
import { ALL_PROFILES, API_PROFILES, PAGE_PROFILES } from '../model.mjs';
import { fail, info, partial, pass, seen } from './result.mjs';

const MISSING_STATUSES = [404, 410];
const ERROR_STATUS = 400;
const UNAUTHORIZED = 401;
const VALIDATOR_HEADERS = ['etag', 'last-modified'];
const LIFECYCLE_HEADERS = ['deprecation', 'sunset'];

const SPEC = {
  http: 'https://www.rfc-editor.org/rfc/rfc9110',
  problemDetails: 'https://www.rfc-editor.org/rfc/rfc9457',
  deprecation: 'https://www.rfc-editor.org/rfc/rfc9745',
};

const statusLabel = (snapshot) => snapshot.error ?? `HTTP ${snapshot.status}`;

function softNotFoundSummary(snapshot) {
  if (snapshot.redirects.length === 0) return `A missing path returns HTTP ${snapshot.status}, which is a soft 404.`;
  return `A missing path redirects to ${new URL(snapshot.finalUrl).pathname} with HTTP ${snapshot.status}, which is a soft 404.`;
}

async function runHonest404(ctx) {
  const snapshot = await loadMissingPage(ctx);
  const { status } = snapshot;
  const evidence = [seen(snapshot, statusLabel(snapshot))];
  if (snapshot.error) return fail(`A request for a missing path gets no response: ${snapshot.error}.`, evidence);
  if (MISSING_STATUSES.includes(status)) return pass(`A missing path returns HTTP ${status}.`, evidence);
  if (status === UNAUTHORIZED) return pass('A missing path asks for credentials before it shows that the path is missing.', evidence);
  if (status >= ERROR_STATUS) {
    return partial(`A missing path returns HTTP ${status}, which is an error but does not say that the path is missing.`, evidence);
  }
  return fail(softNotFoundSummary(snapshot), evidence);
}

const ERROR_FORMAT_RESULTS = {
  problem: [pass, 'An API error is an RFC 9457 problem details object.'],
  json: [partial, 'An API error is a JSON object, but it is not a valid application/problem+json response.'],
  unstructured: [fail, 'An API error has no JSON object with a message, an error, or a code member.'],
};

async function runStructuredErrors(ctx) {
  const { snapshot, format } = await loadApiError(ctx);
  const evidence = [seen(snapshot, `${statusLabel(snapshot)}, ${snapshot.headers['content-type'] ?? 'no content type'}`)];
  if (snapshot.error) return fail(`The API base URL cannot be requested: ${snapshot.error}.`, evidence);
  if (snapshot.status < ERROR_STATUS) {
    return fail(`The API answers a missing path with HTTP ${snapshot.status}, so an agent gets no error.`, evidence);
  }
  const [result, summary] = ERROR_FORMAT_RESULTS[format];
  return result(summary, evidence);
}

async function runCacheValidators(ctx) {
  const entry = await ctx.get(ctx.entryUrl);
  const validators = VALIDATOR_HEADERS.filter((name) => entry.headers[name]);
  const evidence = [seen(entry, validators.length > 0 ? validators.join(', ') : 'no validator')];
  if (validators.length === 0) return fail('The entry response has no ETag header and no Last-Modified header.', evidence);
  return pass(`The entry response has a cache validator: ${validators.join(', ')}.`, evidence);
}

const lifecycleOf = (label, snapshot) =>
  LIFECYCLE_HEADERS.filter((name) => snapshot.headers[name]).map((name) => `${name} on the ${label} response`);

async function runDeprecationHeaders(ctx) {
  const entry = await ctx.get(ctx.entryUrl);
  const { snapshot: error } = await loadApiError(ctx);
  const found = [...lifecycleOf('entry', entry), ...lifecycleOf('error', error)];
  const evidence = [entry, error].map((snapshot) =>
    seen(snapshot, LIFECYCLE_HEADERS.map((name) => `${name}: ${snapshot.headers[name] ?? 'absent'}`).join(', ')),
  );
  if (found.length === 0) return info('The entry response and the error response have no Deprecation or Sunset header.', evidence);
  return info(`The API announces a change of its lifecycle: ${found.join(', ')}.`, evidence);
}

export const groups = [];

export const checks = [
  {
    id: 'recover.honest-404',
    title: 'A missing path returns a 404 status',
    why: 'An agent reads a page with status 200 as real content, so a soft 404 gives the agent wrong data.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.http,
    playbook: 'errors-and-limits',
    run: runHonest404,
  },
  {
    id: 'recover.structured-errors',
    title: 'An API error is an RFC 9457 problem details object',
    why: 'An agent can parse one standard error format for each API, and then it can correct the request.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.problemDetails,
    playbook: 'errors-and-limits',
    run: runStructuredErrors,
  },
  {
    id: 'recover.cache-validators',
    title: 'The entry response has a cache validator',
    why: 'An agent that comes back sends a conditional request, and a 304 response saves the full download.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.http,
    playbook: 'errors-and-limits',
    run: runCacheValidators,
  },
  {
    id: 'recover.deprecation-headers',
    title: 'Deprecation and Sunset headers announce the end of an API version',
    why: 'An agent that sees these headers can tell its user to move to a new version before the old version stops.',
    tier: 'info',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.deprecation,
    playbook: 'errors-and-limits',
    run: runDeprecationHeaders,
  },
  {
    id: 'recover.rate-limits',
    title: 'The API tells an agent its limits and when to try again',
    why: 'An agent that does not know the limit sends requests until the API blocks it, and then cannot tell when to continue.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'judged',
    profiles: API_PROFILES,
    playbook: 'errors-and-limits',
    rubric: {
      pass: 'Each response has RateLimit and RateLimit-Policy headers, or X-RateLimit headers. A 429 response has a Retry-After header.',
      partial: 'Only one of the two exists: the limit headers on each response, or the Retry-After header on a 429 response.',
      fail: 'No response has limit headers, and a 429 response has no Retry-After header.',
      evidence: 'The headers of one authenticated response, the headers of one 429 response, and the rate limit section of the API documentation.',
    },
  },
  {
    id: 'recover.actionable-errors',
    title: 'An error message tells an agent how to correct the request',
    why: 'An agent has no human to ask, so the error must contain all that the agent needs for the next attempt.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'judged',
    profiles: API_PROFILES,
    playbook: 'errors-and-limits',
    rubric: {
      pass: 'A validation error names the field that failed, gives the reason and the valid values, and says how to correct the request.',
      partial: 'The error names the field or the rule that failed, but it gives no valid values and no correction.',
      fail: 'The error is a generic message, for example "Bad Request", or it shows a stack trace.',
      evidence: 'The error bodies for an invalid parameter, a missing required field, and an unknown resource ID, from the API tests or from read-only requests.',
    },
  },
];
