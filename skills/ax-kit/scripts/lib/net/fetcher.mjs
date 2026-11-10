import { LIMITS, USER_AGENT } from '../model.mjs';
import { ALLOWED_METHODS, isAllowedUrl } from './host-policy.mjs';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NO_BODY = { body: '', truncated: false };

const failure = (request, error, redirects = []) => ({
  url: request.url,
  method: request.method,
  finalUrl: redirects.at(-1) ?? request.url,
  status: 0,
  headers: {},
  ...NO_BODY,
  redirects,
  error,
});

async function readBody(response, limit) {
  if (!response.body) return NO_BODY;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let body = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { body: body + decoder.decode(), truncated: false };
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return { body, truncated: true };
    }
    body += decoder.decode(value, { stream: true });
  }
}

async function requestOnce(url, request, fetchImpl) {
  const response = await fetchImpl(url, {
    method: request.method,
    headers: { 'user-agent': USER_AGENT, accept: '*/*', ...request.headers },
    body: request.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(LIMITS.timeoutMs),
  });
  const headers = Object.fromEntries(response.headers.entries());
  if (REDIRECT_STATUSES.has(response.status) && headers.location) {
    await response.body?.cancel();
    return { redirectTo: new URL(headers.location, url).href };
  }
  const content = request.method === 'HEAD' ? NO_BODY : await readBody(response, LIMITS.bodyBytes);
  return { status: response.status, headers, ...content };
}

const errorName = (error) => (error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network');

async function follow(request, { fetchImpl, target }, redirects) {
  let current = request.url;
  for (let hop = 0; hop <= LIMITS.redirects; hop += 1) {
    if (!isAllowedUrl(target, current)) return failure(request, 'blocked_url', redirects);
    const response = await requestOnce(current, request, fetchImpl);
    if (!response.redirectTo) {
      return { url: request.url, method: request.method, finalUrl: current, ...response, redirects, error: null };
    }
    current = response.redirectTo;
    redirects.push(current);
  }
  return failure(request, 'too_many_redirects', redirects);
}

export async function fetchSnapshot(request, { fetchImpl = fetch, target }) {
  if (!ALLOWED_METHODS.has(request.method)) return failure(request, 'method_not_allowed');
  const redirects = [];
  try {
    return await follow(request, { fetchImpl, target }, redirects);
  } catch (error) {
    return failure(request, errorName(error), redirects);
  }
}

export const refusedSnapshot = (request, reason) => failure(request, reason);
