import { isJsonObject, parseJson } from '../json.mjs';
import { appendedWellKnown, insertedWellKnown, missingProviderMembers, missingServerMembers } from './oauth-metadata.mjs';
import { toHttpUrl } from './url.mjs';
import { parseChallenges } from './www-authenticate.mjs';

const RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const SERVER_SUFFIX = 'oauth-authorization-server';
const PROVIDER_SUFFIX = 'openid-configuration';

function jsonObjectOf(snapshot) {
  const value = snapshot.status === 200 ? parseJson(snapshot.body) : null;
  return isJsonObject(value) ? value : null;
}

export function resourceMetadataHint(snapshot) {
  if (snapshot.status !== 401) return null;
  const hints = parseChallenges(snapshot.headers['www-authenticate']).map((challenge) => challenge.params.resource_metadata);
  return toHttpUrl(hints.find(Boolean), snapshot.url)?.href ?? null;
}

const namesResource = (document) => typeof document?.resource === 'string' && document.resource !== '';

const serversOf = (document) =>
  Array.isArray(document.authorization_servers) ? document.authorization_servers.filter((server) => toHttpUrl(server)) : [];

async function findProtectedResource(ctx) {
  const hint = resourceMetadataHint(await ctx.entry());
  const snapshots = [];
  for (const url of new Set([hint, ctx.at(RESOURCE_PATH)].filter(Boolean))) {
    const snapshot = await ctx.get(url);
    const document = jsonObjectOf(snapshot);
    snapshots.push(snapshot);
    if (namesResource(document)) return { document, servers: serversOf(document), fromHeader: url === hint, snapshots };
  }
  return { document: null, servers: [], fromHeader: false, snapshots };
}

export const loadProtectedResource = (ctx) => ctx.once('oauthProtectedResource', () => findProtectedResource(ctx));

// An origin with and without the last slash gives the same well-known URL, so both are correct when no document names the issuer.
async function expectedIssuer(ctx) {
  const [named] = (await loadProtectedResource(ctx)).servers;
  return named ? { issuer: named, accepted: [named] } : { issuer: ctx.origin, accepted: [ctx.origin, `${ctx.origin}/`] };
}

function readMetadata(snapshot, accepted, missingMembers) {
  const document = jsonObjectOf(snapshot);
  const matches = document !== null && accepted.includes(document.issuer);
  const missing = document ? missingMembers(document) : [];
  return { snapshot, document, matches, missing, valid: matches && missing.length === 0 };
}

async function discover(ctx, urlsOf, missingMembers) {
  const { issuer, accepted } = await expectedIssuer(ctx);
  const attempts = [];
  for (const url of new Set(urlsOf(new URL(issuer)))) {
    attempts.push(readMetadata(await ctx.get(url), accepted, missingMembers));
    if (attempts.at(-1).valid) break;
  }
  const best = attempts.find((attempt) => attempt.valid) ?? attempts.find((attempt) => attempt.document) ?? attempts[0];
  return { ...best, issuer, snapshots: attempts.map((attempt) => attempt.snapshot) };
}

export const loadRfc8414 = (ctx) =>
  ctx.once('oauthRfc8414', () => discover(ctx, (issuer) => [insertedWellKnown(issuer, SERVER_SUFFIX)], missingServerMembers));

export const loadOidcDiscovery = (ctx) =>
  ctx.once('oauthOidcDiscovery', () =>
    discover(ctx, (issuer) => [insertedWellKnown(issuer, PROVIDER_SUFFIX), appendedWellKnown(issuer, PROVIDER_SUFFIX)], missingProviderMembers),
  );

export function loadServerMetadata(ctx) {
  return ctx.once('oauthServerMetadata', async () => {
    const server = await loadRfc8414(ctx);
    if (server.valid) return server;
    const provider = await loadOidcDiscovery(ctx);
    return provider.valid ? provider : null;
  });
}
