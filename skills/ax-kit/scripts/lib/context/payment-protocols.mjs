import { Buffer } from 'node:buffer';

import { isJsonObject, parseJson } from '../json.mjs';
import { operationsOf } from './openapi-operations.mjs';
import { challengesWithScheme, parseChallenges } from './www-authenticate.mjs';

const DATED_VERSION = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_REQUIRED = 402;
const CHALLENGE_PARAMETERS = ['id', 'realm', 'method', 'intent', 'request'];

const isText = (value) => typeof value === 'string' && value !== '';
const isList = (value) => Array.isArray(value) && value.length > 0;
const isDated = (value) => typeof value === 'string' && DATED_VERSION.test(value);

const namesOfUnmet = (requirements) => Object.keys(requirements).filter((name) => !requirements[name]);

export const namesAcp = (document) => isJsonObject(document) && document.protocol?.name === 'acp';

export function missingAcpMembers(document) {
  return namesOfUnmet({
    'protocol.version': isDated(document.protocol?.version),
    'protocol.supported_versions': isList(document.protocol?.supported_versions),
    api_base_url: isText(document.api_base_url),
    transports: Array.isArray(document.transports) && document.transports.includes('rest'),
    'capabilities.services': Array.isArray(document.capabilities?.services),
  });
}

export const hasUcpMember = (document) => isJsonObject(document) && isJsonObject(document.ucp);

export function missingUcpMembers(document) {
  return namesOfUnmet({
    'ucp.version': isDated(document.ucp.version),
    'ucp.services': isJsonObject(document.ucp.services),
    'ucp.payment_handlers': isJsonObject(document.ucp.payment_handlers),
  });
}

const decodeBase64Json = (value) => parseJson(Buffer.from(value, 'base64').toString('utf8'));

const isRequirement = (value, version) => isJsonObject(value) && value.x402Version === version && Array.isArray(value.accepts);

export function readX402(snapshot) {
  if (snapshot.status !== PAYMENT_REQUIRED) return { version: null, malformedHeader: false };
  const header = snapshot.headers['payment-required'];
  if (header !== undefined) {
    const current = isRequirement(decodeBase64Json(header), 2);
    return { version: current ? 2 : null, malformedHeader: !current };
  }
  return { version: isRequirement(parseJson(snapshot.body), 1) ? 1 : null, malformedHeader: false };
}

const missingParameters = (challenge) => CHALLENGE_PARAMETERS.filter((name) => !challenge.params[name]);

export function readPaymentChallenge(snapshot) {
  if (snapshot.status !== PAYMENT_REQUIRED) return null;
  const challenges = challengesWithScheme(parseChallenges(snapshot.headers['www-authenticate']), 'payment');
  if (challenges.length === 0) return null;
  const [fewestMissing] = challenges.map(missingParameters).sort((first, second) => first.length - second.length);
  return { missing: fewestMissing };
}

export const pricedOperations = (document) => operationsOf(document).filter(({ operation }) => isJsonObject(operation['x-payment-info']));
