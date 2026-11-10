import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import {
  hasUcpMember,
  missingAcpMembers,
  missingUcpMembers,
  namesAcp,
  pricedOperations,
  readPaymentChallenge,
  readX402,
} from '../../skills/ax-kit/scripts/lib/context/payment-protocols.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, startSite, text } from '../fixtures/server.mjs';

const API = { profile: 'api' };
const COMMERCE = { profile: 'commerce' };
const ACP_PATH = '/.well-known/acp.json';
const UCP_PATH = '/.well-known/ucp';
const TRANSACT_CHECKS = ['transact.acp', 'transact.ucp', 'transact.x402', 'transact.mpp'];

const acpDocument = (overrides = {}) => ({
  protocol: { name: 'acp', version: '2026-04-17', supported_versions: ['2026-01-30', '2026-04-17'] },
  api_base_url: 'https://shop.test/api',
  transports: ['rest'],
  capabilities: { services: ['checkout'] },
  ...overrides,
});

const ucpDocument = (overrides = {}) => ({
  ucp: { version: '2026-08-25', services: { 'dev.ucp.shopping': [] }, payment_handlers: {}, ...overrides },
});

const base64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64');
const requirement = (version) => ({ x402Version: version, resource: { url: 'https://api.test/data' }, accepts: [{ scheme: 'exact' }] });
const paymentRequired = (headers = {}, body = '{}') => ({ '/': { status: 402, headers: { 'content-type': 'application/json', ...headers }, body } });

const CHALLENGE = 'Payment id="x7Tg2pLq", realm="api.test", method="tempo", intent="charge", request="eyJhbW91bnQiOiIxMDAwIn0"';
const withChallenge = (challenge, status = 402) => ({ '/': { status, headers: { 'www-authenticate': challenge }, body: '' } });

const pricedDocument = (operation) => ({ openapi: '3.1.0', info: { title: 'Acme', version: '1' }, paths: { '/free': { get: {} }, '/paid': { post: operation } } });
const OFFER = { 'x-payment-info': { offers: [{ amount: '1000', currency: 'usd', intent: 'charge', method: 'stripe' }] } };

test('an ACP document needs each required member of the discovery RFC', () => {
  assert.deepEqual(missingAcpMembers(acpDocument()), []);
  assert.deepEqual(missingAcpMembers(acpDocument({ api_base_url: undefined })), ['api_base_url']);
  assert.deepEqual(missingAcpMembers(acpDocument({ transports: ['mcp'] })), ['transports']);
  assert.deepEqual(missingAcpMembers(acpDocument({ capabilities: {} })), ['capabilities.services']);
  assert.deepEqual(missingAcpMembers(acpDocument({ protocol: { name: 'acp', version: 'v1', supported_versions: [] } })), [
    'protocol.version',
    'protocol.supported_versions',
  ]);
});

test('an ACP document is known by its protocol name', () => {
  assert.equal(namesAcp(acpDocument()), true);
  assert.equal(namesAcp(acpDocument({ protocol: { name: 'ucp' } })), false);
  assert.equal(namesAcp(acpDocument({ protocol: 'acp' })), false);
  assert.equal(namesAcp(null), false);
  assert.equal(namesAcp([]), false);
});

test('a UCP profile needs a dated version, the services, and the payment handlers', () => {
  assert.deepEqual(missingUcpMembers(ucpDocument()), []);
  assert.deepEqual(missingUcpMembers(ucpDocument({ version: '1.0' })), ['ucp.version']);
  assert.deepEqual(missingUcpMembers(ucpDocument({ services: [] })), ['ucp.services']);
  assert.deepEqual(missingUcpMembers(ucpDocument({ payment_handlers: undefined })), ['ucp.payment_handlers']);
  assert.equal(hasUcpMember(ucpDocument()), true);
  assert.equal(hasUcpMember({ ucp: 'yes' }), false);
  assert.equal(hasUcpMember(null), false);
});

test('x402 version 2 is read from the PAYMENT-REQUIRED header of a 402 response', () => {
  const snapshot = (status, header, body = '{}') => ({ status, headers: header === undefined ? {} : { 'payment-required': header }, body });
  assert.deepEqual(readX402(snapshot(402, base64(requirement(2)))), { version: 2, malformedHeader: false });
  assert.deepEqual(readX402(snapshot(200, base64(requirement(2)))), { version: null, malformedHeader: false });
  assert.deepEqual(readX402(snapshot(402, 'not base64 JSON')), { version: null, malformedHeader: true });
  assert.deepEqual(readX402(snapshot(402, base64(requirement(1)))), { version: null, malformedHeader: true });
  assert.deepEqual(readX402(snapshot(402, base64({ x402Version: 2 }))), { version: null, malformedHeader: true });
});

test('x402 version 1 is read from the body of a 402 response that has no header', () => {
  const snapshot = (status, body) => ({ status, headers: {}, body });
  assert.deepEqual(readX402(snapshot(402, JSON.stringify(requirement(1)))), { version: 1, malformedHeader: false });
  assert.deepEqual(readX402(snapshot(402, JSON.stringify(requirement(2)))), { version: null, malformedHeader: false });
  assert.deepEqual(readX402(snapshot(402, '<html>Pay</html>')), { version: null, malformedHeader: false });
  assert.deepEqual(readX402(snapshot(200, JSON.stringify(requirement(1)))), { version: null, malformedHeader: false });
});

test('a Payment challenge needs the five required parameters', () => {
  const snapshot = (status, challenge) => ({ status, headers: { 'www-authenticate': challenge } });
  assert.deepEqual(readPaymentChallenge(snapshot(402, CHALLENGE)), { missing: [] });
  assert.deepEqual(readPaymentChallenge(snapshot(402, 'Payment id="", realm="api.test", method="tempo"')), { missing: ['id', 'intent', 'request'] });
  assert.equal(readPaymentChallenge(snapshot(402, 'Bearer realm="Payment"')), null);
  assert.equal(readPaymentChallenge(snapshot(401, CHALLENGE)), null);
  assert.equal(readPaymentChallenge({ status: 402, headers: {} }), null);
});

test('the most complete Payment challenge of a response is used', () => {
  const snapshot = { status: 402, headers: { 'www-authenticate': `Payment id="a", ${CHALLENGE}` } };
  assert.deepEqual(readPaymentChallenge(snapshot), { missing: [] });
});

test('priced operations are the operations with an x-payment-info object', () => {
  assert.deepEqual(pricedOperations(pricedDocument(OFFER)).map(({ path, method }) => [path, method]), [['/paid', 'post']]);
  assert.deepEqual(pricedOperations(pricedDocument({ 'x-payment-info': 'paid' })), []);
  assert.deepEqual(pricedOperations(pricedDocument({})), []);
});

test('ACP passes with a complete discovery document', async () => {
  const { result } = await runCheckOn({ [ACP_PATH]: json(acpDocument()) }, 'transact.acp', COMMERCE);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /declares version 2026-04-17\.$/);
});

test('ACP is partial when a required member is missing, and the summary names the member', async () => {
  const { result } = await runCheckOn({ [ACP_PATH]: json(acpDocument({ transports: [] })) }, 'transact.acp', COMMERCE);
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /has no valid transports\.$/);
});

test('ACP fails for another protocol name, for a malformed body, and for no document', async () => {
  assert.equal(await statusOf({ [ACP_PATH]: json({ protocol: { name: 'other' } }) }, 'transact.acp', COMMERCE), 'fail');
  assert.equal(await statusOf({ [ACP_PATH]: html('<html>Not found</html>') }, 'transact.acp', COMMERCE), 'fail');
  assert.equal(await statusOf({ [ACP_PATH]: { status: 404, body: JSON.stringify(acpDocument()) } }, 'transact.acp', COMMERCE), 'fail');
  assert.equal(await statusOf({}, 'transact.acp', COMMERCE), 'fail');
});

test('ACP is not assessed when the server limits the rate', async () => {
  const { result } = await runCheckOn({ [ACP_PATH]: { status: 429 } }, 'transact.acp', COMMERCE);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'rate_limited']);
});

test('UCP passes with a complete profile, and with empty registries', async () => {
  const { result } = await runCheckOn({ [UCP_PATH]: json(ucpDocument()) }, 'transact.ucp', COMMERCE);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /declares version 2026-08-25\.$/);
  assert.equal(await statusOf({ [UCP_PATH]: json(ucpDocument({ services: {}, payment_handlers: {} })) }, 'transact.ucp', COMMERCE), 'pass');
});

test('UCP is partial for a profile with no payment handlers', async () => {
  const { result } = await runCheckOn({ [UCP_PATH]: json(ucpDocument({ payment_handlers: undefined })) }, 'transact.ucp', COMMERCE);
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /has no valid ucp\.payment_handlers\.$/);
});

test('UCP fails with no ucp member, with a malformed body, and with no document', async () => {
  assert.equal(await statusOf({ [UCP_PATH]: json({ version: '2026-08-25' }) }, 'transact.ucp', COMMERCE), 'fail');
  assert.equal(await statusOf({ [UCP_PATH]: text('{"ucp":') }, 'transact.ucp', COMMERCE), 'fail');
  assert.equal(await statusOf({}, 'transact.ucp', COMMERCE), 'fail');
});

test('x402 passes for a version 2 header on the entry response, and requests only the entry URL', async () => {
  const { status, site } = await runCheckOn(paymentRequired({ 'payment-required': base64(requirement(2)) }), 'transact.x402', API);
  assert.equal(status, 'pass');
  assert.deepEqual(site.hits.map((hit) => [hit.method, hit.path]), [['GET', '/']]);
});

test('x402 is partial for a version 1 body', async () => {
  const { result } = await runCheckOn(paymentRequired({}, JSON.stringify(requirement(1))), 'transact.x402', API);
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /version 1/);
});

test('x402 fails for a header that does not decode, and the summary names the header', async () => {
  const { result } = await runCheckOn(paymentRequired({ 'payment-required': '%%%' }), 'transact.x402', API);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /^The PAYMENT-REQUIRED header does not decode/);
});

test('x402 fails when the entry response is not a 402 or has no payment requirement', async () => {
  const success = { '/': json({}, { 'payment-required': base64(requirement(2)) }) };
  assert.equal(await statusOf(success, 'transact.x402', API), 'fail');
  assert.equal(await statusOf(paymentRequired(), 'transact.x402', API), 'fail');
  assert.equal(await statusOf({}, 'transact.x402', API), 'fail');
});

test('MPP passes for a complete Payment challenge on a 402 entry response', async () => {
  const { status, site } = await runCheckOn(withChallenge(CHALLENGE), 'transact.mpp', API);
  assert.equal(status, 'pass');
  assert.equal(site.hits.length, 1);
});

test('MPP reads the Payment challenge from the second of two WWW-Authenticate header lines', async () => {
  assert.equal(await statusOf(withChallenge(['Bearer realm="api"', CHALLENGE]), 'transact.mpp', COMMERCE), 'pass');
});

test('MPP is partial for a Payment challenge with a missing parameter, and the summary names the parameter', async () => {
  const { result } = await runCheckOn(withChallenge(CHALLENGE.replace(', intent="charge"', '')), 'transact.mpp', COMMERCE);
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /has no intent parameter\.$/);
});

test('MPP fails for a Payment challenge on a 401 response and for no challenge', async () => {
  assert.equal(await statusOf(withChallenge(CHALLENGE, 401), 'transact.mpp', COMMERCE), 'fail');
  assert.equal(await statusOf(withChallenge('Bearer realm="api"'), 'transact.mpp', COMMERCE), 'fail');
  assert.equal(await statusOf({}, 'transact.mpp', COMMERCE), 'fail');
});

test('MPP passes for the api profile when an operation of the OpenAPI document has x-payment-info', async () => {
  const { result } = await runCheckOn({ '/openapi.json': json(pricedDocument(OFFER)) }, 'transact.mpp', API);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /x-payment-info for 1 operations\.$/);
  assert.equal(await statusOf({ '/openapi.json': json(pricedDocument({})) }, 'transact.mpp', API), 'fail');
});

test('MPP does not load the OpenAPI document for the commerce profile', async () => {
  const { status, site } = await runCheckOn({ '/openapi.json': json(pricedDocument(OFFER)) }, 'transact.mpp', COMMERCE);
  assert.equal(status, 'fail');
  assert.deepEqual(site.hits.map((hit) => hit.path), ['/']);
});

test('the Transact checks apply to the api and commerce profiles only, and make no request for other profiles', async () => {
  for (const profile of ['content', 'webapp']) {
    for (const id of TRANSACT_CHECKS) {
      const { status, site } = await runCheckOn({}, id, { profile });
      assert.equal(status, 'not_applicable', `${id} ${profile}`);
      assert.equal(site.hits.length, 0);
    }
  }
});

test('the Transact checks add 2 requests to one scan of a store', async () => {
  const site = await startSite({});
  try {
    const ctx = createContext({ target: site.origin, profile: 'commerce' });
    await runChecks(CHECKS.filter((check) => check.id.startsWith('transact.')), ctx);
    assert.deepEqual(site.hits.map((hit) => hit.path).sort(), ['/', ACP_PATH, UCP_PATH].sort());
  } finally {
    await site.close();
  }
});
