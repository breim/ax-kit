import { grantTypesOf } from '../context/oauth-metadata.mjs';
import { loadOidcDiscovery, loadProtectedResource, loadRfc8414, loadServerMetadata } from '../context/oauth.mjs';
import { loadOpenAccess } from '../context/open-access.mjs';
import { API_PROFILES } from '../model.mjs';
import { accessChecks } from './authorize-access.mjs';
import { blocked, fail, partial, pass, seen } from './result.mjs';

const OPEN_ACCESS = 'The API needs no authorization.';
const NO_METADATA = 'No valid authorization server metadata was found, so this check has no result.';
const HEADLESS_GRANTS = ['client_credentials', 'urn:ietf:params:oauth:grant-type:device_code'];

const listOf = (value) => (Array.isArray(value) ? value : []);

const orOpenAccess = (run) => async (ctx) => {
  const result = await run(ctx);
  if (result.status === 'pass') return result;
  const access = await loadOpenAccess(ctx);
  if (!access.open) return result;
  return pass(OPEN_ACCESS, [seen(access.description, 'no security requirement'), seen(access.probe, 'success with no credentials')]);
};

function discoveryResult(found, name) {
  const evidence = found.snapshots.map((snapshot) =>
    seen(snapshot, snapshot === found.snapshot && found.document ? `issuer ${JSON.stringify(found.document.issuer)}` : 'no metadata document'),
  );
  if (!found.document) return fail(`No ${name} is at the well-known location for ${found.issuer}.`, evidence);
  if (!found.matches) return fail(`The issuer in the ${name} is not ${found.issuer}, so a client must reject the document.`, evidence);
  if (found.missing.length > 0) return fail(`The ${name} has no ${found.missing.join(', ')}.`, evidence);
  return pass(`The ${name} is valid, and its issuer matches.`, evidence);
}

const runRfc8414 = async (ctx) => discoveryResult(await loadRfc8414(ctx), 'RFC 8414 metadata');

const runOidcDiscovery = async (ctx) => discoveryResult(await loadOidcDiscovery(ctx), 'OpenID Connect discovery document');

async function runProtectedResource(ctx) {
  const found = await loadProtectedResource(ctx);
  const evidence = found.snapshots.map((snapshot, index) =>
    seen(snapshot, found.document && index === found.snapshots.length - 1 ? 'protected resource metadata' : 'no protected resource metadata'),
  );
  if (!found.document) return fail('No RFC 9728 metadata with a resource member was found.', evidence);
  if (found.servers.length === 0) return partial('The protected resource metadata names no authorization server.', evidence);
  const source = found.fromHeader ? 'the WWW-Authenticate header' : 'the well-known path';
  return pass(`The protected resource metadata from ${source} names the authorization server ${found.servers[0]}.`, evidence);
}

const STATUS_RANK = { pass: 2, partial: 1, fail: 0 };

const betterOf = (best, result) => (STATUS_RANK[result.status] > STATUS_RANK[best.status] ? result : best);

// A server can publish RFC 8414 metadata and OpenID Connect metadata with different members.
// An agent can read each of them, so the best result of the valid documents counts.
const withMetadata = (assess) => async (ctx) => {
  const servers = await loadServerMetadata(ctx);
  if (servers.length === 0) return blocked('authorize.server-metadata', NO_METADATA);
  return servers
    .map((server) => assess(server.document, [seen(server.snapshot, 'authorization server metadata')]))
    .reduce(betterOf);
};

function assessPkce(metadata, evidence) {
  if (!grantTypesOf(metadata).includes('authorization_code')) {
    return pass('The server has no authorization code grant, so PKCE does not apply.', evidence);
  }
  return listOf(metadata.code_challenge_methods_supported).includes('S256')
    ? pass('The server supports PKCE with the S256 method.', evidence)
    : fail('The metadata does not list S256 in code_challenge_methods_supported.', evidence);
}

const assessDynamicRegistration = (metadata, evidence) =>
  typeof metadata.registration_endpoint === 'string' && metadata.registration_endpoint !== ''
    ? pass('The metadata has a registration_endpoint for RFC 7591 registration.', evidence)
    : fail('The metadata has no registration_endpoint.', evidence);

const assessClientIdMetadata = (metadata, evidence) =>
  metadata.client_id_metadata_document_supported === true
    ? pass('The server accepts Client ID Metadata Documents.', evidence)
    : fail('The metadata does not set client_id_metadata_document_supported to true.', evidence);

function assessHeadlessGrant(metadata, evidence) {
  const grants = grantTypesOf(metadata);
  const headless = grants.filter((grant) => HEADLESS_GRANTS.includes(grant));
  if (headless.length > 0) return pass(`The server supports a grant for a client with no browser: ${headless.join(', ')}.`, evidence);
  if (grants !== metadata.grant_types_supported) {
    return fail('The metadata has no grant_types_supported, so the default grants apply, and each default grant needs a browser.', evidence);
  }
  return fail('The server supports no grant for a client with no browser.', evidence);
}

function assessScopes(metadata, evidence) {
  const scopes = listOf(metadata.scopes_supported);
  return scopes.length > 0
    ? pass(`The metadata lists the supported scopes (${scopes.length}).`, evidence)
    : fail('The metadata has no scopes_supported list.', evidence);
}

const SPEC = {
  rfc8414: 'https://www.rfc-editor.org/rfc/rfc8414',
  oidcDiscovery: 'https://openid.net/specs/openid-connect-discovery-1_0.html',
  protectedResource: 'https://www.rfc-editor.org/rfc/rfc9728',
  pkce: 'https://www.rfc-editor.org/rfc/rfc7636',
  dynamicRegistration: 'https://www.rfc-editor.org/rfc/rfc7591',
  clientIdMetadata: 'https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/',
  deviceGrant: 'https://www.rfc-editor.org/rfc/rfc8628',
};

export const groups = [
  {
    id: 'authorize.server-metadata',
    title: 'An agent can discover the authorization server',
    why: 'An agent reads the endpoints and the grants of the authorization server from one document, with no manual setup.',
    tier: 'essential',
    stability: 'stable',
    profiles: API_PROFILES,
    playbook: 'oauth-for-agents',
  },
  {
    id: 'authorize.client-registration',
    title: 'An agent can register as a client with no manual step',
    why: 'An agent that cannot register itself needs a person to create a client in a dashboard.',
    tier: 'recommended',
    stability: 'stable',
    profiles: API_PROFILES,
    playbook: 'oauth-for-agents',
  },
];

export const checks = [
  {
    id: 'authorize.rfc8414-metadata',
    title: 'RFC 8414 authorization server metadata is published',
    group: 'authorize.server-metadata',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.rfc8414,
    run: orOpenAccess(runRfc8414),
  },
  {
    id: 'authorize.oidc-discovery',
    title: 'OpenID Connect discovery metadata is published',
    group: 'authorize.server-metadata',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.oidcDiscovery,
    run: orOpenAccess(runOidcDiscovery),
  },
  {
    id: 'authorize.protected-resource-metadata',
    title: 'RFC 9728 metadata names the authorization server of the API',
    why: 'An agent starts at the API, so the API must say which authorization server gives the token.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.protectedResource,
    playbook: 'oauth-for-agents',
    run: orOpenAccess(runProtectedResource),
  },
  {
    id: 'authorize.pkce-s256',
    title: 'The authorization server supports PKCE with the S256 method',
    why: 'PKCE protects the authorization code of a public client, and an agent client refuses a server that does not list it.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.pkce,
    playbook: 'oauth-for-agents',
    run: orOpenAccess(withMetadata(assessPkce)),
  },
  {
    id: 'authorize.dynamic-registration',
    title: 'The authorization server has an RFC 7591 registration endpoint',
    group: 'authorize.client-registration',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.dynamicRegistration,
    run: orOpenAccess(withMetadata(assessDynamicRegistration)),
  },
  {
    id: 'authorize.client-id-metadata',
    title: 'The authorization server accepts Client ID Metadata Documents',
    group: 'authorize.client-registration',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.clientIdMetadata,
    reviewed: '2026-11',
    run: orOpenAccess(withMetadata(assessClientIdMetadata)),
  },
  {
    id: 'authorize.headless-grant',
    title: 'The authorization server has a grant for a client with no browser',
    why: 'An agent on a server has no browser, so it needs the client credentials grant or the device code grant.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.deviceGrant,
    playbook: 'oauth-for-agents',
    run: orOpenAccess(withMetadata(assessHeadlessGrant)),
  },
  {
    id: 'authorize.scopes',
    title: 'The metadata lists the supported scopes',
    why: 'An agent that can read the list of scopes asks only for the scopes that the task needs.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: API_PROFILES,
    spec: SPEC.rfc8414,
    playbook: 'oauth-for-agents',
    run: orOpenAccess(withMetadata(assessScopes)),
  },
  ...accessChecks,
];
