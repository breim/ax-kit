import { isJsonObject } from '../json.mjs';
import { loadOpenapi } from './api-description.mjs';
import { operationsOf } from './openapi-operations.mjs';
import { toHttpUrl } from './url.mjs';

const CLOSED = { open: false };

const hasEntries = (value) => (Array.isArray(value) ? value.length > 0 : isJsonObject(value) && Object.keys(value).length > 0);

export const declaresSecurity = (document) =>
  hasEntries(document.security) ||
  hasEntries(document.components?.securitySchemes) ||
  hasEntries(document.securityDefinitions) ||
  operationsOf(document).some(({ operation }) => hasEntries(operation.security));

// A server URL on another host can be a placeholder. A probe of that host gives no evidence for the scanned origin.
export function probeUrl(document, descriptionUrl, origin) {
  const target = operationsOf(document).find(({ method, path }) => method === 'get' && !path.includes('{'));
  const base = toHttpUrl(document.servers?.[0]?.url ?? document.basePath ?? '/', descriptionUrl);
  if (!target || base?.origin !== origin) return null;
  return toHttpUrl(`${origin}${base.pathname.replace(/\/$/, '')}${target.path}`)?.href ?? null;
}

const isSuccess = (status) => status >= 200 && status < 300;

async function findOpenAccess(ctx) {
  const api = await loadOpenapi(ctx);
  if (api.state !== 'found' || declaresSecurity(api.document)) return CLOSED;
  const url = probeUrl(api.document, api.url, ctx.origin);
  if (!url) return CLOSED;
  const probe = await ctx.get(url);
  return { open: isSuccess(probe.status), description: api.snapshot, probe };
}

export const loadOpenAccess = (ctx) => ctx.once('openAccess', () => findOpenAccess(ctx));
