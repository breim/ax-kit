import { LIMITS } from '../model.mjs';
import { fetchSnapshot, refusedSnapshot } from '../net/fetcher.mjs';
import { createLimiter } from '../net/limiter.mjs';

const TRANSIENT_ERRORS = { timeout: 'timeout', network: 'network', deadline: 'deadline', budget: 'deadline' };

export class Transient extends Error {
  constructor(reason, snapshot) {
    super(`transient: ${reason}`);
    this.reason = reason;
    this.snapshot = snapshot;
  }
}

export function transientReason(snapshot) {
  if (snapshot.error) return TRANSIENT_ERRORS[snapshot.error] ?? null;
  if (snapshot.status === 429) return 'rate_limited';
  if (snapshot.status >= 500) return 'server_error';
  return null;
}

const lowercaseKeys = (headers) =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));

const requestKey = (request) =>
  JSON.stringify([request.method, request.url, Object.entries(request.headers).sort(), request.body ?? null]);

export function createContext({ target, profile, fetchImpl = fetch, limiter = createLimiter(LIMITS), timeoutMs }) {
  const entryUrl = new URL(target).href;
  const origin = new URL(target).origin;
  const snapshots = new Map();
  const resources = new Map();

  async function send(request) {
    const outcome = await limiter.run(request.method, () => fetchSnapshot(request, { fetchImpl, target: entryUrl, timeoutMs }));
    return outcome.refused ? refusedSnapshot(request, outcome.refused) : outcome.value;
  }

  function fetchOnce(url, { method = 'GET', headers = {}, body } = {}) {
    const request = { url: new URL(url, entryUrl).href, method, headers: lowercaseKeys(headers), body };
    const key = requestKey(request);
    if (!snapshots.has(key)) snapshots.set(key, send(request));
    return snapshots.get(key);
  }

  async function get(url, options) {
    const snapshot = await fetchOnce(url, options);
    const reason = transientReason(snapshot);
    if (reason) throw new Transient(reason, snapshot);
    return snapshot;
  }

  function once(key, factory) {
    if (!resources.has(key)) resources.set(key, factory());
    return resources.get(key);
  }

  return {
    profile,
    entryUrl,
    origin,
    fetch: fetchOnce,
    get,
    once,
    entry: () => fetchOnce(entryUrl),
    at: (path) => new URL(path, origin).href,
    requests: () => limiter.stats(),
  };
}
