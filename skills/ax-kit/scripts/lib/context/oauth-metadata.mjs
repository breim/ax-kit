const DEFAULT_GRANT_TYPES = ['authorization_code', 'implicit'];
const AUTHORIZATION_ENDPOINT_GRANTS = ['authorization_code', 'implicit'];

const isText = (value) => typeof value === 'string' && value !== '';
const isList = (value) => Array.isArray(value) && value.length > 0;

const withoutLastSlash = (path) => path.replace(/\/$/, '');

export const insertedWellKnown = (issuer, suffix) => `${issuer.origin}/.well-known/${suffix}${withoutLastSlash(issuer.pathname)}`;

export const appendedWellKnown = (issuer, suffix) => `${issuer.origin}${withoutLastSlash(issuer.pathname)}/.well-known/${suffix}`;

export const grantTypesOf = (metadata) => (isList(metadata.grant_types_supported) ? metadata.grant_types_supported : DEFAULT_GRANT_TYPES);

const usesAuthorizationEndpoint = (grants) => grants.some((grant) => AUTHORIZATION_ENDPOINT_GRANTS.includes(grant));
const usesTokenEndpoint = (grants) => grants.some((grant) => grant !== 'implicit');

const namesOfUnmet = (requirements) => Object.keys(requirements).filter((name) => !requirements[name]);

export function missingServerMembers(metadata) {
  const grants = grantTypesOf(metadata);
  return namesOfUnmet({
    issuer: isText(metadata.issuer),
    response_types_supported: isList(metadata.response_types_supported),
    authorization_endpoint: !usesAuthorizationEndpoint(grants) || isText(metadata.authorization_endpoint),
    token_endpoint: !usesTokenEndpoint(grants) || isText(metadata.token_endpoint),
  });
}

export function missingProviderMembers(metadata) {
  return namesOfUnmet({
    issuer: isText(metadata.issuer),
    authorization_endpoint: isText(metadata.authorization_endpoint),
    token_endpoint: !usesTokenEndpoint(grantTypesOf(metadata)) || isText(metadata.token_endpoint),
    jwks_uri: isText(metadata.jwks_uri),
    response_types_supported: isList(metadata.response_types_supported),
    subject_types_supported: isList(metadata.subject_types_supported),
    id_token_signing_alg_values_supported: isList(metadata.id_token_signing_alg_values_supported),
  });
}
