# OAuth for agents

- **Reviewed:** 2026-11
- **Pillar:** Authorize
- **Checks:** `authorize.protected-resource-metadata`, `authorize.pkce-s256`, `authorize.headless-grant`, `authorize.scopes`, group `authorize.server-metadata` = `authorize.rfc8414-metadata`, `authorize.oidc-discovery`, group `authorize.client-registration` = `authorize.dynamic-registration`, `authorize.client-id-metadata`
- **Template:** `assets/oauth-protected-resource.json`

## Why agents need it

An agent starts with only the URL of the API. A human reads the documentation, creates a client in a dashboard, and copies the endpoints.
An agent needs each of these facts in a document at a known location.
OAuth has a discovery chain for this purpose. The agent follows the chain from the API to a token, with no manual setup.

This playbook does not apply to an API that needs no authorization. For the rule that the scanner uses, read the Verify section.

## Status of the standard

- RFC 9728 (protected resource metadata) and RFC 8414 (authorization server metadata) are IETF Standards Track documents. They are stable.
- RFC 7636 (PKCE), RFC 7591 (dynamic client registration), RFC 8628 (device code grant), and RFC 8707 (resource indicators) are also stable.
- OpenID Connect Discovery 1.0 is a stable specification of the OpenID Foundation.
- Client ID Metadata Documents is an IETF draft, `draft-ietf-oauth-client-id-metadata-document`. Version 03 is current in 2026-11. It is emerging.
- MCP revision `2026-07-28` builds its authorization on these documents. It recommends Client ID Metadata Documents, and it deprecates dynamic client registration.
- RFC 9700 is the current security practice for OAuth 2.0.

## Implement

### 1. Point to the metadata from a 401 response

If a request has no token, return status 401 with a `WWW-Authenticate` header that has a `resource_metadata` parameter:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://api.acme.example/.well-known/oauth-protected-resource", scope="invoices:read"
```

The `scope` parameter tells the agent which scopes this request needs. If a token has too few scopes, return status 403 with `error="insufficient_scope"` and the `scope` parameter.

### 2. Publish the protected resource metadata

Serve a JSON document at `/.well-known/oauth-protected-resource` on the API host, with status 200 and `Content-Type: application/json`.

```json
{
  "resource": "https://api.acme.example",
  "authorization_servers": ["https://auth.acme.example"],
  "scopes_supported": ["invoices:read", "invoices:write"],
  "bearer_methods_supported": ["header"]
}
```

- `resource` is required. It is the identifier of the API. A client rejects the document if `resource` is not identical to the identifier that it used.
- `authorization_servers` lists the issuer identifiers. MCP needs one entry or more.
- If the identifier has a path, RFC 9728 puts the well-known string before the path: `https://api.acme.example/.well-known/oauth-protected-resource/v1`.

### 3. Publish the authorization server metadata

RFC 8414 puts the well-known string between the host and the path of the issuer. OpenID Connect Discovery adds it after the path.

| Issuer | RFC 8414 location | OpenID Connect location |
|---|---|---|
| `https://auth.acme.example` | `/.well-known/oauth-authorization-server` | `/.well-known/openid-configuration` |
| `https://auth.acme.example/t1` | `/.well-known/oauth-authorization-server/t1` | `/t1/.well-known/openid-configuration` |

An MCP client tries the RFC 8414 location first. It uses the first document that it finds, so keep the two documents the same.

```json
{
  "issuer": "https://auth.acme.example",
  "authorization_endpoint": "https://auth.acme.example/authorize",
  "token_endpoint": "https://auth.acme.example/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["invoices:read", "invoices:write"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true
}
```

- RFC 8414 requires `issuer` and `response_types_supported`. It requires `authorization_endpoint` and `token_endpoint` when a supported grant uses that endpoint.
- OpenID Connect Discovery also requires `jwks_uri`, `subject_types_supported`, and `id_token_signing_alg_values_supported`.
- `issuer` must be identical to the entry in `authorization_servers`. A last slash is a difference.
- If `grant_types_supported` is absent, the default is `["authorization_code", "implicit"]`. List the grants.

### 4. Require PKCE with S256

Put `"S256"` in `code_challenge_methods_supported`, and reject an authorization request that has no `code_challenge`.
If the member is absent, RFC 8414 says that the server does not support PKCE. An MCP client then stops.
RFC 7636 permits the `plain` method only for a client that cannot use `S256`.

### 5. Let an agent register as a client

- **Client ID Metadata Documents (first choice).** The client uses an HTTPS URL as its `client_id`. The server gets the client metadata from that URL. Set `client_id_metadata_document_supported` to `true`.
- **Dynamic client registration (the older way).** Publish a `registration_endpoint` that follows RFC 7591. Keep it for clients that do not support the first choice.

For Client ID Metadata Documents, the server must make sure that the `client_id` in the document is identical to the URL. It must also compare each redirect URI with the document.
The group `authorize.client-registration` passes when one of the two ways is available.

### 6. Give a grant to a client with no browser

- **Client credentials.** The agent acts for itself, as a service account. Add `client_credentials` to `grant_types_supported`.
- **Device code (RFC 8628).** The agent shows a code and a URL, and the user approves on a different device. Add `urn:ietf:params:oauth:grant-type:device_code` to `grant_types_supported`, and publish `device_authorization_endpoint`.

### 7. Use scopes with least privilege

- Publish `scopes_supported`. Make each scope small, for example `invoices:read` and `invoices:write`. Do not use one scope for all operations.
- Put the scopes for the current request in the `scope` parameter of the challenge.
- Do not put `offline_access` in the protected resource metadata or in the challenge.

### 8. Bind the token to the API

RFC 8707 defines the `resource` parameter. An MCP client sends it in the authorization request and in the token request: `resource=https%3A%2F%2Fapi.acme.example`.
Put that value in the audience of the token. The API must reject a token that has a different audience.

### 9. Keep tokens short-lived

Give each access token a short life. If the client is public, rotate the refresh token at each use.

## Stack notes

- **Identity platform:** most platforms serve `/.well-known/openid-configuration`. Make sure that the document has `code_challenge_methods_supported`. Then add only the protected resource metadata on the API host.
- **Next.js:** `app/.well-known/oauth-protected-resource/route.ts`. Set the `Content-Type` in the response, because the path has no extension.
- **Express, Hono, FastAPI:** add one route for the metadata, and one middleware that sets `WWW-Authenticate` on each 401 response.
- **API gateway:** make sure that the gateway does not remove the `WWW-Authenticate` header, and that it sends the well-known paths to the API.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<api-host>/<protected-path>
curl -s https://<api-host>/.well-known/oauth-protected-resource
curl -s https://<issuer-host>/.well-known/oauth-authorization-server
node <skill-dir>/scripts/ax.mjs scan https://<api-host> --profile api --json
```

The scanner reads the `resource_metadata` URL of a 401 response first, and the well-known path second.
It uses the first URL in `authorization_servers` as the issuer. If no document names an authorization server, it uses the origin of the scanned URL.

- `authorize.protected-resource-metadata` passes when the document has `resource` and one URL or more in `authorization_servers`. It is partial when the document names no authorization server.
- `authorize.rfc8414-metadata` and `authorize.oidc-discovery` pass when the document has each required member and an `issuer` that matches.
- The checks below read the first valid document, RFC 8414 first. If no valid document exists, they are blocked.
- `authorize.pkce-s256` passes when `code_challenge_methods_supported` has `S256`, or when the server has no authorization code grant.
- `authorize.dynamic-registration` passes when `registration_endpoint` exists. `authorize.client-id-metadata` passes when `client_id_metadata_document_supported` is `true`.
- `authorize.headless-grant` passes when `grant_types_supported` has `client_credentials` or the device code grant.
- `authorize.scopes` passes when `scopes_supported` has one entry or more.

**Open access.** Each check above also passes when the scanner has evidence that the API needs no authorization. The evidence has four parts.
The scanned URL does not return status 401. The OpenAPI document is JSON. It declares no security scheme and no security requirement.
One `GET` operation with no path parameter, on the scanned origin, returns a 2xx status with no credentials.

## Security notes

- **Exact `issuer` match.** A client must reject metadata whose `issuer` is different from the identifier that it used. Return the `iss` parameter of RFC 9207 in the authorization response.
- **Exact redirect URI match.** Compare each redirect URI with the registered value as a string. Do not accept a prefix or a pattern.
- **No implicit grant and no password grant.** RFC 9700 tells clients not to use the implicit grant, and it prohibits the password grant.
- **No token in a URL.** Accept the token only in the `Authorization` header. A URL goes into logs and into the `Referer` header.
- **No token for a different API.** Validate the audience of each token. Do not send a token that the API received to a different service.
- **Protect the fetch of client metadata.** The URL comes from the client, so block private addresses and limit the size of the response.
- **Limit the registration endpoint.** An open registration endpoint needs a rate limit.
- Serve each endpoint over HTTPS. The metadata is public, so do not put a secret in it.

## Common mistakes

- **A different last slash.** `authorization_servers` has `https://auth.acme.example/`, and `issuer` has `https://auth.acme.example`. A client rejects the metadata.
- **A 401 response with no `WWW-Authenticate` header.** The agent does not know where the chain starts.
- **Metadata on the marketing host only.** An agent starts at the API host. Publish the protected resource metadata there.
- **No `grant_types_supported`.** The default has no grant for a client with no browser, so the agent does not try one.
- **No `code_challenge_methods_supported` in an OpenID Connect document.** OpenID Connect Discovery does not define the member, but agent clients need it.
- **Two metadata documents with different content.** A client reads only the first document that it finds.
