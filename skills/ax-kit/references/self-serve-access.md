# Self-serve access

- **Reviewed:** 2026-11
- **Pillar:** Authorize
- **Checks:** `authorize.self-serve-credentials` (Review), `authorize.sandbox` (Review), `authorize.auth-md` (Watch)
- **Template:** none

## Why agents need it

An agent must get a credential before its first call. A signup form with a CAPTCHA stops it. A verification email stops it. A "contact sales" page stops it.
No human is there to do these steps. A product that gives credentials through an API, a CLI, or OAuth lets the agent start immediately.

Self-serve access is not open access. The product replaces the steps for a human with controls for a machine: an identity, a scope, and a limit.

## Status of the standard

- No one standard defines signup for agents. The parts are stable: API keys, the client credentials grant, dynamic client registration (RFC 7591), and the device code grant (RFC 8628).
- `auth.md` is a convention from WorkOS for agent registration. Its documentation is at <https://workos.com/auth-md/docs>. No standards body owns it. It is emerging.
- The `auth.md` flows use the JWT bearer grant (RFC 7523) and an IETF draft for identity assertions, `draft-ietf-oauth-identity-assertion-authz-grant`.

## Implement

### 1. Write down the path to the first credential

List each step from no account to a working credential. Mark each step that needs a person.
For each marked step, select a control from the steps below that a machine can pass.

### 2. Accept a signup from a client that proves its identity

Keep the CAPTCHA for anonymous traffic. Do not show it to a client that proves its identity in one of these ways:

- **A signed request.** A verified agent signs its requests, for example with HTTP Message Signatures (RFC 9421).
- **An identity assertion.** An agent provider that the product trusts asserts the identity of the user. The `auth.md` convention defines one flow of this type.
- **An existing credential.** An account that has a token can create more keys with that token.

### 3. Create keys through an API or a CLI

```http
POST /v1/api-keys HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "report-agent", "scopes": ["invoices:read"], "expires_in_days": 30 }
```

```json
{
  "id": "key_8f2a",
  "secret": "<shown one time>",
  "scopes": ["invoices:read"],
  "expires_at": "2026-12-10T00:00:00Z"
}
```

- Show the secret one time. Keep only a hash of it.
- Give the API an operation to list the keys and an operation to revoke a key.
- Give the CLI the same operations with flags and JSON output: `acme keys create --scope invoices:read --expires 30d --json`.
- Do not use an interactive prompt in the CLI. An agent cannot answer a prompt reliably.

For OAuth, automatic client registration has the same effect. Read [oauth-for-agents.md](oauth-for-agents.md).

### 4. Give each key a scope and an end date

- Make the default scope small. The agent asks for more when a task needs more.
- Set an end date by default. Let the caller select a shorter life.
- Record the name, the creator, and the last use of each key.

### 5. Provide a sandbox with test keys

- Give each new account a test key with no approval step.
- Give test keys a prefix that is easy to see, for example `sk_test_`.
- Make the sandbox accept the same operations as the live API. A write in the sandbox must have no real effect.
- Document each difference between the sandbox and the live API.

### 6. Publish auth.md (emerging, optional)

This step repeats only what the documentation of the convention says. Read the documentation before you implement it.

- `auth.md` is one Markdown file that the service hosts at its root, typically `https://<host>/auth.md`.
- The file tells an agent how to register, which flows the service supports, and which scopes it can request.
- The protected resource metadata stays the source of truth. `auth.md` is the prose that points to it.
- The authorization server metadata gets an `agent_auth` member. Its `skill` member is the URL of the file.
- The convention has two flows. In the agent verified flow, an agent provider asserts the identity of the user. In the user claimed flow, the user confirms a code on a page of the service.
- The file starts with the title `# auth.md`. Its sections follow the order of the flow: discover, select a method, register, claim, exchange, use the token, errors, and revocation.

### 7. Publish the terms and the limits for a machine

- Link to the terms of service and the policy from the metadata. RFC 9728 has `resource_tos_uri` and `resource_policy_uri`. RFC 8414 has `op_tos_uri` and `op_policy_uri`.
- Return the rate limit in response headers. Read [errors-and-limits.md](errors-and-limits.md).
- Publish the quotas of each plan as text or JSON. An image or a table that a script renders is not sufficient.

## Stack notes

- **Authentication platform:** many platforms have an API for keys or for machine clients. Use that API before you write a new one.
- **Web framework:** put the key operations behind the same authentication as the other API operations. Do not make a second login path.
- **CLI:** read the token from a flag, a file, or an environment variable, and print JSON with `--json`.
- **Static documentation site:** `auth.md` is a static file. Serve it as `text/markdown` or `text/plain`.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<host>/auth.md
node <skill-dir>/scripts/ax.mjs scan https://<api-host> --profile api --json
```

- `authorize.auth-md` passes when the file returns status 200 and starts with an H1 title. The scanner reads the URL in `agent_auth.skill` of the RFC 8414 metadata first, then `/auth.md`.
- `authorize.self-serve-credentials` is a Review check. Follow the documented path from no account to a credential. It passes when no step needs a person.
- `authorize.sandbox` is a Review check. It passes when an agent can get test credentials with no human step, and a test write has no real effect.

Do not create an account on a live site to verify these checks, unless the owner approves it.

## Security notes

- **Self-serve access needs abuse controls.** Limit the rate of signups and of new keys. Give a new account a small quota. Keep the default scope small.
- **Do not remove verification with nothing in its place.** Replace a CAPTCHA with a control that a legitimate agent can pass. A signed identity and a low first quota are examples.
- **Verify the acting user for a consequential action.** A payment, a deletion, or a data export needs a new approval from the user, not only a valid key.
- **Protect the secret.** Show it one time, keep a hash, and give it a prefix that secret scanners can find.
- **Isolate the sandbox.** A test key must not read or change live data.
- **Record the actor.** Write an audit event for each key that an agent creates, uses for a write, or revokes.
- `auth.md` is public. Do not put a secret or an internal URL in it.

## Common mistakes

- **Keys that only a dashboard can create.** The agent needs a person for the first step.
- **A key with all permissions and no end date.** One leak then gives full access for an unlimited time.
- **An email link as the only verification.** Give a second path, for example a device code that the user confirms.
- **A sandbox that needs approval from a sales team.** The agent cannot try a write safely.
- **A CAPTCHA that is removed with no rate limit.** Automated abuse starts immediately.
- **An `auth.md` that disagrees with the metadata.** An agent uses the metadata, and the file then causes errors.
