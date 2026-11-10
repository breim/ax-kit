import { loadOpenapi } from '../context/api-description.mjs';
import {
  hasUcpMember,
  missingAcpMembers,
  missingUcpMembers,
  namesAcp,
  pricedOperations,
  readPaymentChallenge,
  readX402,
} from '../context/payment-protocols.mjs';
import { parseJson } from '../json.mjs';
import { fail, partial, pass, seen } from './result.mjs';

const ACP_PATH = '/.well-known/acp.json';
const UCP_PATH = '/.well-known/ucp';

async function fetchDocument(ctx, path) {
  const snapshot = await ctx.get(ctx.at(path));
  return { snapshot, document: snapshot.status === 200 ? parseJson(snapshot.body) : null };
}

async function runAcp(ctx) {
  const { snapshot, document } = await fetchDocument(ctx, ACP_PATH);
  if (!namesAcp(document)) return fail(`No ACP discovery document is at ${ACP_PATH}.`, [seen(snapshot, 'absent or invalid')]);
  const missing = missingAcpMembers(document);
  if (missing.length > 0) return partial(`The ACP discovery document has no valid ${missing.join(', ')}.`, [seen(snapshot, 'incomplete')]);
  return pass(`The ACP discovery document declares version ${document.protocol.version}.`, [seen(snapshot, 'valid')]);
}

async function runUcp(ctx) {
  const { snapshot, document } = await fetchDocument(ctx, UCP_PATH);
  if (!hasUcpMember(document)) return fail(`No UCP profile is at ${UCP_PATH}.`, [seen(snapshot, 'absent or invalid')]);
  const missing = missingUcpMembers(document);
  if (missing.length > 0) return partial(`The UCP profile has no valid ${missing.join(', ')}.`, [seen(snapshot, 'incomplete')]);
  return pass(`The UCP profile declares version ${document.ucp.version}.`, [seen(snapshot, 'valid')]);
}

async function runX402(ctx) {
  const entry = await ctx.get(ctx.entryUrl);
  const { version, malformedHeader } = readX402(entry);
  const evidence = [seen(entry, version ? `x402 version ${version}` : 'no x402 payment requirement')];
  if (version === 2) return pass('The entry URL answers with HTTP 402 and an x402 version 2 PAYMENT-REQUIRED header.', evidence);
  if (version === 1) return partial('The entry URL uses x402 version 1, which has no PAYMENT-REQUIRED header.', evidence);
  if (malformedHeader) return fail('The PAYMENT-REQUIRED header does not decode to an x402 version 2 payment requirement.', evidence);
  return fail('The entry URL gives no x402 payment requirement, and the scanner reads no other URL.', evidence);
}

// Only the api profile loads the OpenAPI document in other checks. For the commerce profile, this lookup adds about 7 requests.
async function findPricedOperations(ctx) {
  const api = ctx.profile === 'api' ? await loadOpenapi(ctx) : { state: 'missing' };
  if (api.state !== 'found') return { count: 0, evidence: [] };
  const count = pricedOperations(api.document).length;
  return { count, evidence: [seen(api.snapshot, `x-payment-info on ${count} operations`)] };
}

async function runMpp(ctx) {
  const entry = await ctx.get(ctx.entryUrl);
  const challenge = readPaymentChallenge(entry);
  const seenEntry = seen(entry, challenge ? 'Payment challenge' : 'no Payment challenge');
  if (challenge?.missing.length === 0) return pass('The entry URL answers with HTTP 402 and a Payment challenge.', [seenEntry]);
  const priced = await findPricedOperations(ctx);
  const evidence = [seenEntry, ...priced.evidence];
  if (priced.count > 0) return pass(`The OpenAPI document gives payment terms in x-payment-info for ${priced.count} operations.`, evidence);
  if (challenge) return partial(`The Payment challenge has no ${challenge.missing.join(', ')} parameter.`, evidence);
  return fail('No Payment challenge and no x-payment-info member were found.', evidence);
}

const SPEC = {
  acp: 'https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/rfcs/rfc.discovery.md',
  ucp: 'https://ucp.dev/specification/overview/',
  x402: 'https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md',
  mpp: 'https://datatracker.ietf.org/doc/draft-httpauth-payment/',
};

export const groups = [
  {
    id: 'transact.payment-protocol',
    title: 'An agent can pay through a published protocol',
    why: 'A checkout form is made for a person, so an agent needs a payment protocol that a machine can use.',
    tier: 'recommended',
    stability: 'emerging',
    profiles: ['api', 'commerce'],
    playbook: 'agentic-commerce',
  },
];

export const checks = [
  {
    id: 'transact.acp',
    title: 'An Agentic Commerce Protocol discovery document is published',
    group: 'transact.payment-protocol',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.acp,
    reviewed: '2026-11',
    run: runAcp,
  },
  {
    id: 'transact.ucp',
    title: 'A Universal Commerce Protocol profile is published',
    group: 'transact.payment-protocol',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.ucp,
    reviewed: '2026-11',
    run: runUcp,
  },
  {
    id: 'transact.x402',
    title: 'The entry URL gives an x402 payment requirement',
    group: 'transact.payment-protocol',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.x402,
    reviewed: '2026-11',
    run: runX402,
  },
  {
    id: 'transact.mpp',
    title: 'The API gives a Machine Payments Protocol challenge or payment terms',
    group: 'transact.payment-protocol',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.mpp,
    reviewed: '2026-11',
    run: runMpp,
  },
];
