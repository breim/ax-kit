import { isJsonObject, parseJson } from '../json.mjs';
import { loadOpenapi } from './api-description.mjs';
import { MISSING_SEGMENT } from './missing-page.mjs';

const ERROR_ACCEPT = 'application/json';
const PROBLEM_TYPE = /^\s*application\/problem\+json\b/i;
const PROBLEM_TEXT_MEMBERS = ['type', 'title', 'detail'];
const ERROR_MEMBERS = ['message', 'error', 'errors', 'code', ...PROBLEM_TEXT_MEMBERS];
const HTTP_PROTOCOLS = ['http:', 'https:'];

export const isProblemType = (snapshot) => PROBLEM_TYPE.test(snapshot.headers['content-type'] ?? '');

const describesProblem = (body) => PROBLEM_TEXT_MEMBERS.some((member) => typeof body[member] === 'string');

// RFC 9457 section 3.1 tells a consumer to ignore a member with the wrong value type.
const statusAgrees = (body, status) => typeof body.status !== 'number' || body.status === status;

const hasErrorMember = (body) => ERROR_MEMBERS.some((member) => body[member] !== undefined && body[member] !== null);

export function errorFormatOf(snapshot) {
  const body = parseJson(snapshot.body);
  if (!isJsonObject(body)) return 'unstructured';
  if (isProblemType(snapshot) && describesProblem(body) && statusAgrees(body, snapshot.status)) return 'problem';
  return isProblemType(snapshot) || hasErrorMember(body) ? 'json' : 'unstructured';
}

function resolveServerUrl(url, documentUrl) {
  if (typeof url !== 'string' || url.includes('{')) return null;
  try {
    const resolved = new URL(url, documentUrl);
    return HTTP_PROTOCOLS.includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

export function serverUrlOf(openapi) {
  if (openapi.state !== 'found') return null;
  return resolveServerUrl(openapi.document.servers?.[0]?.url, openapi.url);
}

export function missingUrlBelow(base) {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${MISSING_SEGMENT}`;
  url.search = '';
  url.hash = '';
  return url.href;
}

export function loadApiError(ctx) {
  return ctx.once('apiError', async () => {
    const base = serverUrlOf(await loadOpenapi(ctx)) ?? ctx.origin;
    const snapshot = await ctx.get(missingUrlBelow(base), { headers: { accept: ERROR_ACCEPT } });
    return { base, snapshot, format: errorFormatOf(snapshot) };
  });
}
