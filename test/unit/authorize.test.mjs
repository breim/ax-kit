import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import {
  appendedWellKnown,
  grantTypesOf,
  insertedWellKnown,
  missingProviderMembers,
  missingServerMembers,
} from '../../skills/ax-kit/scripts/lib/context/oauth-metadata.mjs';
import { resourceMetadataHint } from '../../skills/ax-kit/scripts/lib/context/oauth.mjs';
import { declaresSecurity, probeUrl } from '../../skills/ax-kit/scripts/lib/context/open-access.mjs';
import { toHttpUrl } from '../../skills/ax-kit/scripts/lib/context/url.mjs';
import { parseChallenges } from '../../skills/ax-kit/scripts/lib/context/www-authenticate.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';

const API = { profile: 'api' };
const RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const SERVER_PATH = '/.well-known/oauth-authorization-server';
const PROVIDER_PATH = '/.well-known/openid-configuration';
const OPEN_ACCESS = 'The API needs no authorization.';
const DEVICE_CODE = 'urn:ietf:params:oauth:grant-type:device_code';

const SCORE_CHECKS = [
  'authorize.rfc8414-metadata',
  'authorize.oidc-discovery',
  'authorize.protected-resource-metadata',
  'authorize.pkce-s256',
  'authorize.dynamic-registration',
  'authorize.client-id-metadata',
  'authorize.headless-grant',
  'authorize.scopes',
];
const METADATA_CHECKS = SCORE_CHECKS.slice(3);

const originOf = (request) => `http://${request.headers.host}`;

const serverDocument = (issuer, overrides = {}) => ({
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  response_types_supported: ['code'],
  ...overrides,
});

const providerDocument = (issuer, overrides = {}) => ({
  ...serverDocument(issuer),
  jwks_uri: `${issuer}/jwks`,
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  ...overrides,
});

const serverMetadata = (overrides) => (request) => json(serverDocument(originOf(request), overrides));
const providerMetadata = (overrides) => (request) => json(providerDocument(originOf(request), overrides));
const withServer = (overrides) => ({ [SERVER_PATH]: serverMetadata(overrides) });

const resourceMetadata = (serversOf = (origin) => [origin]) => (request) =>
  json({ resource: originOf(request), authorization_servers: serversOf(originOf(request)) });

const tenantSite = (documentAt) => ({
  [RESOURCE_PATH]: resourceMetadata((origin) => [`${origin}/tenant`]),
  ...documentAt,
});

test('the challenge parser reads the scheme and the parameters of one challenge', () => {
  assert.deepEqual(parseChallenges('Bearer realm="api", resource_metadata="https://x.test/prm"'), [
    { scheme: 'bearer', params: { realm: 'api', resource_metadata: 'https://x.test/prm' } },
  ]);
});

test('the challenge parser splits two challenges that one header value joins with a comma', () => {
  const challenges = parseChallenges('Basic realm="a", Payment id="1", method=tempo');
  assert.deepEqual(challenges, [
    { scheme: 'basic', params: { realm: 'a' } },
    { scheme: 'payment', params: { id: '1', method: 'tempo' } },
  ]);
});

test('the challenge parser keeps a comma, a scheme name, and an escaped quote inside a quoted string', () => {
  const [challenge, ...others] = parseChallenges('Bearer error_description="Pay, then Payment id=\\"1\\"", scope="a b"');
  assert.deepEqual(others, []);
  assert.deepEqual(challenge.params, { error_description: 'Pay, then Payment id="1"', scope: 'a b' });
});

test('the challenge parser reads names with no case and returns no challenge for an empty header', () => {
  assert.deepEqual(parseChallenges('PAYMENT ID="1"'), [{ scheme: 'payment', params: { id: '1' } }]);
  assert.deepEqual(parseChallenges(undefined), []);
  assert.deepEqual(parseChallenges(''), []);
  assert.deepEqual(parseChallenges('realm="a"'), []);
});

test('the URL helper accepts only HTTP URLs that parse', () => {
  assert.equal(toHttpUrl('https://x.test/a').href, 'https://x.test/a');
  assert.equal(toHttpUrl('/a', 'https://x.test').href, 'https://x.test/a');
  assert.equal(toHttpUrl('/a'), null);
  assert.equal(toHttpUrl('javascript:alert(1)'), null);
  assert.equal(toHttpUrl('https://a b/'), null);
  assert.equal(toHttpUrl(42), null);
});

test('RFC 8414 puts the well-known string between the host and the path of the issuer', () => {
  const insert = (issuer) => insertedWellKnown(new URL(issuer), 'oauth-authorization-server');
  assert.equal(insert('https://as.test'), 'https://as.test/.well-known/oauth-authorization-server');
  assert.equal(insert('https://as.test/'), 'https://as.test/.well-known/oauth-authorization-server');
  assert.equal(insert('https://as.test:8443/tenant'), 'https://as.test:8443/.well-known/oauth-authorization-server/tenant');
  assert.equal(insert('https://as.test/a/b/'), 'https://as.test/.well-known/oauth-authorization-server/a/b');
});

test('OpenID Connect discovery adds the well-known string after the path of the issuer', () => {
  const append = (issuer) => appendedWellKnown(new URL(issuer), 'openid-configuration');
  assert.equal(append('https://as.test'), 'https://as.test/.well-known/openid-configuration');
  assert.equal(append('https://as.test/tenant/'), 'https://as.test/tenant/.well-known/openid-configuration');
});

test('RFC 8414 metadata needs issuer and response_types_supported in each case', () => {
  const complete = serverDocument('https://as.test');
  assert.deepEqual(missingServerMembers(complete), []);
  assert.deepEqual(missingServerMembers({ ...complete, issuer: undefined }), ['issuer']);
  assert.deepEqual(missingServerMembers({ ...complete, response_types_supported: [] }), ['response_types_supported']);
  assert.deepEqual(missingServerMembers({}), ['issuer', 'response_types_supported', 'authorization_endpoint', 'token_endpoint']);
});

test('RFC 8414 metadata needs each endpoint only for a grant that uses it', () => {
  const base = { issuer: 'https://as.test', response_types_supported: ['code'] };
  assert.deepEqual(missingServerMembers({ ...base, grant_types_supported: ['client_credentials'] }), ['token_endpoint']);
  assert.deepEqual(missingServerMembers({ ...base, grant_types_supported: ['client_credentials'], token_endpoint: 'https://as.test/token' }), []);
  assert.deepEqual(missingServerMembers({ ...base, grant_types_supported: ['implicit'] }), ['authorization_endpoint']);
  assert.deepEqual(missingServerMembers({ ...base, token_endpoint: 'https://as.test/token' }), ['authorization_endpoint']);
});

test('a missing or empty grant_types_supported means the default grants of RFC 8414', () => {
  assert.deepEqual(grantTypesOf({}), ['authorization_code', 'implicit']);
  assert.deepEqual(grantTypesOf({ grant_types_supported: [] }), ['authorization_code', 'implicit']);
  assert.deepEqual(grantTypesOf({ grant_types_supported: ['client_credentials'] }), ['client_credentials']);
});

test('OpenID Connect discovery metadata needs each required member', () => {
  const complete = providerDocument('https://as.test');
  assert.deepEqual(missingProviderMembers(complete), []);
  for (const member of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri', 'response_types_supported', 'subject_types_supported', 'id_token_signing_alg_values_supported']) {
    assert.deepEqual(missingProviderMembers({ ...complete, [member]: undefined }), [member]);
  }
  assert.deepEqual(missingProviderMembers({ ...complete, token_endpoint: undefined, grant_types_supported: ['implicit'] }), []);
});

test('the resource metadata hint is read only from a 401 response', () => {
  const snapshot = (status, challenge) => ({ status, url: 'https://api.test/v1', headers: { 'www-authenticate': challenge } });
  assert.equal(resourceMetadataHint(snapshot(401, 'Bearer resource_metadata="https://api.test/prm"')), 'https://api.test/prm');
  assert.equal(resourceMetadataHint(snapshot(401, 'DPoP resource_metadata="/prm"')), 'https://api.test/prm');
  assert.equal(resourceMetadataHint(snapshot(403, 'Bearer resource_metadata="https://api.test/prm"')), null);
  assert.equal(resourceMetadataHint(snapshot(401, 'Bearer realm="api"')), null);
  assert.equal(resourceMetadataHint(snapshot(401, 'Bearer resource_metadata="https://a b/prm"')), null);
  assert.equal(resourceMetadataHint({ status: 401, url: 'https://api.test/', headers: {} }), null);
});

test('RFC 8414 metadata passes at the entry origin when the issuer matches', async () => {
  const { result, site } = await runCheckOn(withServer(), 'authorize.rfc8414-metadata', API);
  assert.equal(result.status, 'pass');
  assert.equal(site.hitsFor(SERVER_PATH).length, 1);
});

test('RFC 8414 metadata accepts the origin with a last slash as the issuer when no document names the issuer', async () => {
  const routes = { [SERVER_PATH]: (request) => json(serverDocument(`${originOf(request)}/`)) };
  assert.equal(await statusOf(routes, 'authorize.rfc8414-metadata', API), 'pass');
});

test('RFC 8414 metadata fails when the issuer is different', async () => {
  const routes = { [SERVER_PATH]: json(serverDocument('https://other.example')) };
  const { result } = await runCheckOn(routes, 'authorize.rfc8414-metadata', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /issuer .* is not http:\/\/127\.0\.0\.1:\d+, so a client must reject/);
});

test('RFC 8414 metadata fails when a required member is missing, and the summary names the member', async () => {
  const { result } = await runCheckOn(withServer({ response_types_supported: undefined }), 'authorize.rfc8414-metadata', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /has no response_types_supported\.$/);
});

test('RFC 8414 metadata fails for no document, for a body that is not JSON, and for a JSON array', async () => {
  assert.equal(await statusOf({}, 'authorize.rfc8414-metadata', API), 'fail');
  assert.equal(await statusOf({ [SERVER_PATH]: text('{"issuer":') }, 'authorize.rfc8414-metadata', API), 'fail');
  assert.equal(await statusOf({ [SERVER_PATH]: json([]) }, 'authorize.rfc8414-metadata', API), 'fail');
});

test('RFC 8414 metadata is not assessed when the server fails', async () => {
  const { result } = await runCheckOn({ [SERVER_PATH]: { status: 503 } }, 'authorize.rfc8414-metadata', API);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

test('the issuer comes from the protected resource metadata, and its path follows the well-known string', async () => {
  const routes = tenantSite({ [`${SERVER_PATH}/tenant`]: (request) => json(serverDocument(`${originOf(request)}/tenant`)) });
  const { status, site } = await runCheckOn(routes, 'authorize.rfc8414-metadata', API);
  assert.equal(status, 'pass');
  assert.equal(site.hitsFor(SERVER_PATH).length, 0);
});

test('an issuer that a document names must match with no change, and a last slash is a difference', async () => {
  const routes = tenantSite({ [`${SERVER_PATH}/tenant`]: (request) => json(serverDocument(`${originOf(request)}/tenant/`)) });
  assert.equal(await statusOf(routes, 'authorize.rfc8414-metadata', API), 'fail');
});

test('server metadata is read from the other host that the protected resource metadata names', async () => {
  const server = await startSite(withServer());
  try {
    const routes = { [RESOURCE_PATH]: resourceMetadata(() => [server.origin]) };
    const { status, site } = await runCheckOn(routes, 'authorize.rfc8414-metadata', API);
    assert.equal(status, 'pass');
    assert.equal(server.hitsFor(SERVER_PATH).length, 1);
    assert.equal(site.hitsFor(SERVER_PATH).length, 0);
  } finally {
    await server.close();
  }
});

test('OpenID Connect discovery passes at the entry origin', async () => {
  assert.equal(await statusOf({ [PROVIDER_PATH]: providerMetadata() }, 'authorize.oidc-discovery', API), 'pass');
});

test('OpenID Connect discovery fails for RFC 8414 members only, and the summary names the missing members', async () => {
  const { result } = await runCheckOn({ [PROVIDER_PATH]: serverMetadata() }, 'authorize.oidc-discovery', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /has no jwks_uri, subject_types_supported, id_token_signing_alg_values_supported\.$/);
});

test('OpenID Connect discovery fails when the issuer is different or the document is missing', async () => {
  assert.equal(await statusOf({ [PROVIDER_PATH]: json(providerDocument('https://other.example')) }, 'authorize.oidc-discovery', API), 'fail');
  assert.equal(await statusOf({}, 'authorize.oidc-discovery', API), 'fail');
});

test('OpenID Connect discovery tries the inserted location first and the appended location second', async () => {
  const tenantProvider = (request) => json(providerDocument(`${originOf(request)}/tenant`));
  const appended = await runCheckOn(tenantSite({ [`/tenant${PROVIDER_PATH}`]: tenantProvider }), 'authorize.oidc-discovery', API);
  assert.equal(appended.status, 'pass');
  assert.equal(appended.site.hitsFor(`${PROVIDER_PATH}/tenant`).length, 1);

  const inserted = await runCheckOn(tenantSite({ [`${PROVIDER_PATH}/tenant`]: tenantProvider }), 'authorize.oidc-discovery', API);
  assert.equal(inserted.status, 'pass');
  assert.equal(inserted.site.hitsFor(`/tenant${PROVIDER_PATH}`).length, 0);
});

test('protected resource metadata passes at the well-known path', async () => {
  const { result } = await runCheckOn({ [RESOURCE_PATH]: resourceMetadata() }, 'authorize.protected-resource-metadata', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /from the well-known path names the authorization server http:\/\/127\.0\.0\.1:\d+\.$/);
});

test('protected resource metadata passes through the WWW-Authenticate header of a 401 response', async () => {
  const routes = {
    '/': { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="/docs/prm.json"' }, body: '' },
    '/docs/prm.json': resourceMetadata(),
  };
  const { result, site } = await runCheckOn(routes, 'authorize.protected-resource-metadata', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /from the WWW-Authenticate header/);
  assert.equal(site.hitsFor(RESOURCE_PATH).length, 0);
});

test('protected resource metadata reads the hint from the second of two WWW-Authenticate header lines', async () => {
  const challenges = ['Basic realm="api"', 'Bearer resource_metadata="/docs/prm.json"'];
  const routes = { '/': { status: 401, headers: { 'www-authenticate': challenges }, body: '' }, '/docs/prm.json': resourceMetadata() };
  assert.equal(await statusOf(routes, 'authorize.protected-resource-metadata', API), 'pass');
});

test('protected resource metadata uses the well-known path when the hint gives no metadata', async () => {
  const routes = {
    '/': { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="/missing.json"' }, body: '' },
    [RESOURCE_PATH]: resourceMetadata(),
  };
  const { result, site } = await runCheckOn(routes, 'authorize.protected-resource-metadata', API);
  assert.match(result.summary, /from the well-known path/);
  assert.equal(site.hitsFor('/missing.json').length, 1);
});

test('protected resource metadata ignores the hint when the entry response is not a 401', async () => {
  const routes = { '/': html('<html></html>', { 'www-authenticate': 'Bearer resource_metadata="/docs/prm.json"' }), '/docs/prm.json': resourceMetadata() };
  const { status, site } = await runCheckOn(routes, 'authorize.protected-resource-metadata', API);
  assert.equal(status, 'fail');
  assert.equal(site.hitsFor('/docs/prm.json').length, 0);
});

test('protected resource metadata is partial when no entry of authorization_servers is a URL', async () => {
  const withServers = (servers) => ({ [RESOURCE_PATH]: json({ resource: 'https://api.test', authorization_servers: servers }) });
  assert.equal(await statusOf(withServers([]), 'authorize.protected-resource-metadata', API), 'partial');
  assert.equal(await statusOf(withServers(['not a url', 7]), 'authorize.protected-resource-metadata', API), 'partial');
  assert.equal(await statusOf({ [RESOURCE_PATH]: json({ resource: 'https://api.test' }) }, 'authorize.protected-resource-metadata', API), 'partial');
});

test('protected resource metadata fails with no resource member, with a malformed body, and with no document', async () => {
  const servers = { authorization_servers: ['https://as.test'] };
  assert.equal(await statusOf({ [RESOURCE_PATH]: json(servers) }, 'authorize.protected-resource-metadata', API), 'fail');
  assert.equal(await statusOf({ [RESOURCE_PATH]: text('<html>') }, 'authorize.protected-resource-metadata', API), 'fail');
  assert.equal(await statusOf({}, 'authorize.protected-resource-metadata', API), 'fail');
});

test('an entry of authorization_servers that is not a URL does not stop the scan, and the origin is the issuer', async () => {
  const routes = { [RESOURCE_PATH]: json({ resource: 'https://api.test', authorization_servers: ['::not a url::'] }), ...withServer() };
  assert.equal(await statusOf(routes, 'authorize.rfc8414-metadata', API), 'pass');
});

test('PKCE passes only when the metadata lists S256', async () => {
  const withMethods = (methods) => withServer({ code_challenge_methods_supported: methods });
  assert.equal(await statusOf(withMethods(['plain', 'S256']), 'authorize.pkce-s256', API), 'pass');
  assert.equal(await statusOf(withMethods(['plain']), 'authorize.pkce-s256', API), 'fail');
  assert.equal(await statusOf(withMethods(['s256']), 'authorize.pkce-s256', API), 'fail');
  assert.equal(await statusOf(withMethods('S256'), 'authorize.pkce-s256', API), 'fail');
  assert.equal(await statusOf(withServer(), 'authorize.pkce-s256', API), 'fail');
});

test('PKCE does not apply to a server with no authorization code grant', async () => {
  const routes = withServer({ grant_types_supported: ['client_credentials'], authorization_endpoint: undefined });
  const { result } = await runCheckOn(routes, 'authorize.pkce-s256', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /PKCE does not apply/);
});

test('each check that reads the server metadata is blocked when no document exists', async () => {
  for (const id of METADATA_CHECKS) {
    const { result } = await runCheckOn({}, id, API);
    assert.deepEqual([result.status, result.blockedBy], ['fail', 'authorize.server-metadata'], id);
  }
});

test('a document that is not valid counts as no metadata', async () => {
  const noResponseTypes = withServer({ response_types_supported: undefined, code_challenge_methods_supported: ['S256'] });
  const otherIssuer = { [SERVER_PATH]: json(serverDocument('https://other.example', { code_challenge_methods_supported: ['S256'] })) };
  assert.equal((await runCheckOn(noResponseTypes, 'authorize.pkce-s256', API)).result.blockedBy, 'authorize.server-metadata');
  assert.equal((await runCheckOn(otherIssuer, 'authorize.pkce-s256', API)).result.blockedBy, 'authorize.server-metadata');
});

test('the OpenID Connect document gives the server metadata when no RFC 8414 document exists', async () => {
  const routes = { [PROVIDER_PATH]: providerMetadata({ code_challenge_methods_supported: ['S256'] }) };
  assert.equal(await statusOf(routes, 'authorize.pkce-s256', API), 'pass');
});

test('the RFC 8414 document has priority over the OpenID Connect document', async () => {
  const routes = { ...withServer(), [PROVIDER_PATH]: providerMetadata({ code_challenge_methods_supported: ['S256'] }) };
  assert.equal(await statusOf(routes, 'authorize.pkce-s256', API), 'fail');
});

test('dynamic registration passes with a registration endpoint and fails without one', async () => {
  assert.equal(await statusOf(withServer({ registration_endpoint: 'https://as.test/register' }), 'authorize.dynamic-registration', API), 'pass');
  assert.equal(await statusOf(withServer({ registration_endpoint: '' }), 'authorize.dynamic-registration', API), 'fail');
  assert.equal(await statusOf(withServer(), 'authorize.dynamic-registration', API), 'fail');
});

test('Client ID Metadata Documents pass only for the boolean value true', async () => {
  const withFlag = (value) => withServer({ client_id_metadata_document_supported: value });
  assert.equal(await statusOf(withFlag(true), 'authorize.client-id-metadata', API), 'pass');
  assert.equal(await statusOf(withFlag('true'), 'authorize.client-id-metadata', API), 'fail');
  assert.equal(await statusOf(withFlag(false), 'authorize.client-id-metadata', API), 'fail');
  assert.equal(await statusOf(withServer(), 'authorize.client-id-metadata', API), 'fail');
});

test('the headless grant passes for client credentials and for the device code grant', async () => {
  const withGrants = (grants) => withServer({ grant_types_supported: grants });
  assert.equal(await statusOf(withGrants(['authorization_code', 'client_credentials']), 'authorize.headless-grant', API), 'pass');
  assert.equal(await statusOf(withGrants(['authorization_code', DEVICE_CODE]), 'authorize.headless-grant', API), 'pass');
  assert.equal(await statusOf(withGrants(['authorization_code', 'refresh_token']), 'authorize.headless-grant', API), 'fail');
});

test('the headless grant fails with the default grants when grant_types_supported is missing', async () => {
  const { result } = await runCheckOn(withServer(), 'authorize.headless-grant', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /the default grants apply/);
});

test('scopes pass for a list with one entry or more', async () => {
  const withScopes = (scopes) => withServer({ scopes_supported: scopes });
  assert.equal(await statusOf(withScopes(['read']), 'authorize.scopes', API), 'pass');
  assert.equal(await statusOf(withScopes([]), 'authorize.scopes', API), 'fail');
  assert.equal(await statusOf(withScopes('read write'), 'authorize.scopes', API), 'fail');
  assert.equal(await statusOf(withServer(), 'authorize.scopes', API), 'fail');
});

const openDocument = (overrides = {}) => ({
  openapi: '3.1.0',
  info: { title: 'Acme', version: '1' },
  paths: { '/items/{id}': { get: {} }, '/items': { post: {}, get: {} } },
  ...overrides,
});
const openSite = (overrides) => ({ '/openapi.json': json(openDocument(overrides)), '/items': json([]) });

test('a document declares security through a requirement or a scheme, at each level', () => {
  assert.equal(declaresSecurity(openDocument()), false);
  assert.equal(declaresSecurity(openDocument({ security: [], components: { securitySchemes: {} }, securityDefinitions: {} })), false);
  assert.equal(declaresSecurity(openDocument({ security: [{ apiKey: [] }] })), true);
  assert.equal(declaresSecurity(openDocument({ components: { securitySchemes: { apiKey: { type: 'apiKey' } } } })), true);
  assert.equal(declaresSecurity(openDocument({ securityDefinitions: { basic: { type: 'basic' } } })), true);
  assert.equal(declaresSecurity(openDocument({ paths: { '/items': { get: {}, post: { security: [{ oauth: ['write'] }] } } } })), true);
});

const probeOf = (overrides, at = 'https://api.test/docs/openapi.json') => probeUrl(openDocument(overrides), at, 'https://api.test');

test('the probe is the first GET operation with no path parameter, below the base path of the server', () => {
  assert.equal(probeOf(), 'https://api.test/items');
  assert.equal(probeOf({ servers: [{ url: '/v1/' }] }), 'https://api.test/v1/items');
  assert.equal(probeOf({ servers: [{ url: 'https://api.test/v2' }, { url: 'https://api.test/v3' }] }), 'https://api.test/v2/items');
  assert.equal(probeOf({ swagger: '2.0', basePath: '/api' }), 'https://api.test/api/items');
});

test('no probe exists for a server on another origin', () => {
  assert.equal(probeOf({ servers: [{ url: 'https://data.test/v2' }] }), null);
  assert.equal(probeOf({ servers: [{ url: 'https://{tenant}.api.test' }] }), null);
  assert.equal(probeOf({ servers: [{ url: 'http://api.test' }] }), null);
  assert.equal(probeOf({ servers: [{ url: 'https://a b/' }] }), null);
  assert.equal(probeOf({}, 'https://docs.test/openapi.json'), null);
});

test('no probe exists when each operation needs a path parameter or is a write', () => {
  assert.equal(probeOf({ paths: { '/items/{id}': { get: {} }, '/items': { post: {} } } }), null);
  assert.equal(probeOf({ paths: {} }), null);
});

test('an open API passes each Authorize score check with the open access summary', async () => {
  for (const id of SCORE_CHECKS) {
    const { result } = await runCheckOn(openSite(), id, API);
    assert.deepEqual([result.status, result.summary, result.blockedBy], ['pass', OPEN_ACCESS, undefined], id);
  }
});

test('the probe is one GET request with no credentials, below the base path of the server', async () => {
  const routes = { '/openapi.json': json(openDocument({ servers: [{ url: '/v1' }] })), '/v1/items': json([]) };
  const { result, site } = await runCheckOn(routes, 'authorize.scopes', API);
  assert.equal(result.summary, OPEN_ACCESS);
  assert.equal(site.hitsFor('/items').length, 0);
  assert.deepEqual(site.hitsFor('/v1/items').map((hit) => [hit.method, hit.headers.authorization]), [['GET', undefined]]);
});

test('an API whose probe needs credentials keeps the measured result', async () => {
  const routes = { ...openSite(), '/items': { status: 401, body: '' } };
  const { result, site } = await runCheckOn(routes, 'authorize.rfc8414-metadata', API);
  assert.equal(result.status, 'fail');
  assert.equal(site.hitsFor('/items').length, 1);
  assert.equal((await runCheckOn(routes, 'authorize.pkce-s256', API)).result.blockedBy, 'authorize.server-metadata');
});

test('open access needs a 2xx status from the probe and an OpenAPI document', async () => {
  assert.equal(await statusOf({ ...openSite(), '/items': { status: 299, body: '' } }, 'authorize.scopes', API), 'pass');
  assert.equal(await statusOf({ ...openSite(), '/items': { status: 300, body: '' } }, 'authorize.scopes', API), 'fail');
  assert.equal(await statusOf({ ...openSite(), '/items': { status: 404 } }, 'authorize.scopes', API), 'fail');
  assert.equal(await statusOf({ '/items': json([]) }, 'authorize.scopes', API), 'fail');
});

test('a document with a security scheme or a security requirement never gives open access, and sends no probe', async () => {
  const documents = [
    { components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } } } },
    { securityDefinitions: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } } },
    { security: [{ apiKey: [] }] },
    { paths: { '/items': { get: { security: [{ apiKey: [] }] } } } },
  ];
  for (const overrides of documents) {
    const { result, site } = await runCheckOn(openSite(overrides), 'authorize.rfc8414-metadata', API);
    assert.equal(result.status, 'fail', JSON.stringify(overrides));
    assert.equal(site.hitsFor('/items').length, 0, JSON.stringify(overrides));
  }
});

test('an entry response with status 401 shows that the API needs authorization, and sends no probe', async () => {
  const entry = (status) => ({ ...openSite(), '/': { status, body: '' } });
  const unauthorized = await runCheckOn(entry(401), 'authorize.rfc8414-metadata', API);
  assert.equal(unauthorized.status, 'fail');
  assert.equal(unauthorized.site.hitsFor('/items').length, 0);
  assert.equal((await runCheckOn(entry(403), 'authorize.rfc8414-metadata', API)).result.summary, OPEN_ACCESS);
});

test('a YAML description is not evidence of open access', async () => {
  const routes = { '/openapi.yaml': text('openapi: 3.0.3\npaths:\n  /items:\n    get: {}\n'), '/items': json([]) };
  assert.equal(await statusOf(routes, 'authorize.rfc8414-metadata', API), 'fail');
});

test('a check that passes from its own evidence keeps its summary and sends no probe', async () => {
  const { result, site } = await runCheckOn({ ...openSite(), ...withServer() }, 'authorize.rfc8414-metadata', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /RFC 8414 metadata is valid/);
  assert.equal(site.hitsFor('/items').length, 0);
});

test('open access is not assessed when the probe gets a server error', async () => {
  const { result } = await runCheckOn({ ...openSite(), '/items': { status: 500 } }, 'authorize.rfc8414-metadata', API);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

test('auth.md passes at the service root when it is Markdown with a title', async () => {
  const { result } = await runCheckOn({ '/auth.md': text('# auth.md\n\nYou are an agent.\n') }, 'authorize.auth-md', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /\/auth\.md\.$/);
});

test('auth.md fails for an HTML page, for text with no title, for an error status, and for no file', async () => {
  assert.equal(await statusOf({ '/auth.md': html('<!doctype html><html><h1>Sign in</h1></html>') }, 'authorize.auth-md', API), 'fail');
  assert.equal(await statusOf({ '/auth.md': text('Not found') }, 'authorize.auth-md', API), 'fail');
  assert.equal(await statusOf({ '/auth.md': text('## Register\n\n# auth.md\n') }, 'authorize.auth-md', API), 'fail');
  assert.equal(await statusOf({ '/auth.md': { status: 403, body: '# auth.md\n' } }, 'authorize.auth-md', API), 'fail');
  assert.equal(await statusOf({}, 'authorize.auth-md', API), 'fail');
});

test('auth.md is read first from the agent_auth.skill member of the server metadata', async () => {
  const routes = {
    [SERVER_PATH]: (request) => json(serverDocument(originOf(request), { agent_auth: { skill: `${originOf(request)}/docs/auth.md` } })),
    '/docs/auth.md': text('# auth.md\n'),
  };
  const { status, site } = await runCheckOn(routes, 'authorize.auth-md', API);
  assert.equal(status, 'pass');
  assert.equal(site.hitsFor('/auth.md').length, 0);
});

test('auth.md uses the service root when the skill member is not an absolute URL', async () => {
  const withSkill = (skill) => ({ ...withServer({ agent_auth: { skill } }), '/auth.md': text('# auth.md\n') });
  assert.equal(await statusOf(withSkill('::not a url::'), 'authorize.auth-md', API), 'pass');
  assert.equal(await statusOf(withSkill(42), 'authorize.auth-md', API), 'pass');
  const { status, site } = await runCheckOn(withSkill('/relative.md'), 'authorize.auth-md', API);
  assert.equal(status, 'pass');
  assert.equal(site.hitsFor('/relative.md').length, 0);
});

test('auth.md uses the service root when the skill URL gives no file, and ignores a skill from another issuer', async () => {
  const skillOf = (request) => ({ agent_auth: { skill: `${originOf(request)}/missing.md` } });
  const missing = { [SERVER_PATH]: (request) => json(serverDocument(originOf(request), skillOf(request))), '/auth.md': text('# auth.md\n') };
  const first = await runCheckOn(missing, 'authorize.auth-md', API);
  assert.equal(first.status, 'pass');
  assert.equal(first.site.hitsFor('/missing.md').length, 1);

  const otherIssuer = { [SERVER_PATH]: (request) => json(serverDocument('https://other.example', skillOf(request))), '/missing.md': text('# auth.md\n') };
  const second = await runCheckOn(otherIssuer, 'authorize.auth-md', API);
  assert.equal(second.status, 'fail');
  assert.equal(second.site.hitsFor('/missing.md').length, 0);
});

test('the review checks are not assessed by the scanner', async () => {
  for (const id of ['authorize.self-serve-credentials', 'authorize.sandbox']) {
    const { result, site } = await runCheckOn({}, id, API);
    assert.deepEqual([result.status, result.reason], ['not_assessed', 'not_reviewed'], id);
    assert.equal(site.hits.length, 0);
  }
});

test('the Authorize checks are not applicable to the content profile and make no request', async () => {
  for (const id of [...SCORE_CHECKS, 'authorize.auth-md']) {
    const { status, site } = await runCheckOn({}, id);
    assert.equal(status, 'not_applicable', id);
    assert.equal(site.hits.length, 0);
  }
});

const SHARED_PATHS = ['/', '/.well-known/api-catalog', '/openapi.json'];

const tenantServer = (request) =>
  json(serverDocument(`${originOf(request)}/tenant`, { agent_auth: { skill: `${originOf(request)}/docs/auth.md` } }));
const worstCaseSite = {
  [RESOURCE_PATH]: resourceMetadata((origin) => [`${origin}/tenant`]),
  [`${SERVER_PATH}/tenant`]: tenantServer,
  ...openSite(),
};
const CHAIN_PATHS = [
  '/.well-known/oauth-authorization-server/tenant',
  '/.well-known/oauth-protected-resource',
  '/.well-known/openid-configuration/tenant',
  '/auth.md',
  '/docs/auth.md',
  '/tenant/.well-known/openid-configuration',
];

async function addedRequests(routes) {
  const site = await startSite(routes);
  try {
    const ctx = createContext({ target: site.origin, profile: 'api' });
    await runChecks(CHECKS.filter((check) => check.id.startsWith('authorize.')), ctx);
    return site.hits.map((hit) => hit.path).filter((path) => !SHARED_PATHS.includes(path)).sort();
  } finally {
    await site.close();
  }
}

test('the Authorize checks add 7 requests at most to one scan, with a hint or with a probe', async () => {
  const hinted = { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="/missing.json"' }, body: '' };
  assert.deepEqual(await addedRequests({ ...worstCaseSite, '/': hinted }), [...CHAIN_PATHS, '/missing.json'].sort());
  assert.deepEqual(await addedRequests(worstCaseSite), [...CHAIN_PATHS, '/items'].sort());
});
