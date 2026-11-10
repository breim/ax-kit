# Check catalog

This file is generated from the check registry. Do not edit it. Run `npm run catalog` to update it.

Registry version 1. Scanner version 0.1.0.

## Scoring constants

- Tier weights in a pillar: essential 4, recommended 2, optional 1.
- Credit: pass 1, partial 0.5, fail 0.
- A failed gate limits the score to 59.
- Grades: A from 90, B from 80, C from 70, D from 60, F from 0.
- Request limits: 80 requests, 2 at a time, 8 s for each request, 90 s in total.

### Pillar weights by profile

| Pillar | content | api | webapp | commerce |
| --- | --- | --- | --- | --- |
| Reach | 20 | 5 | 15 | 15 |
| Discover | 30 | 20 | 20 | 25 |
| Read | 40 | 0 | 25 | 45 |
| Act | 0 | 35 | 15 | 0 |
| Authorize | 0 | 25 | 15 | 0 |
| Recover | 10 | 15 | 10 | 15 |
| Transact | 0 | 0 | 0 | 0 |

## Score checks

These checks give the AX Score. A group takes the result of its best member.

### Reach

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `reach.plain-fetch` (gate) | A plain request reaches the site with no bot challenge | essential | content, api, webapp, commerce | [bot-access](bot-access.md) |
| `reach.robots-txt` | A robots.txt file gives rules to crawlers and agents | essential | content, webapp, commerce | [bot-access](bot-access.md) |
| `reach.user-agents-allowed` | robots.txt allows user-directed agents on the entry page | essential | content, webapp, commerce | [bot-access](bot-access.md) |
| `reach.bot-policy-explicit` | robots.txt states an explicit policy for AI agents | recommended | content, webapp, commerce | [bot-access](bot-access.md) |

### Discover

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `discover.sitemap` | An XML sitemap lists the pages | recommended | content, webapp, commerce | [sitemap-and-links](sitemap-and-links.md) |
| `discover.llms-txt` | llms.txt gives a curated map of the site | recommended | content, api, webapp, commerce | [llms-txt](llms-txt.md) |
| `discover.llms-txt-quality` | llms.txt is small, links to Markdown, and has no broken links | optional | content, api, webapp, commerce | [llms-txt](llms-txt.md) |
| `discover.link-headers` | Link headers point to agent resources | optional | content, api, webapp, commerce | [sitemap-and-links](sitemap-and-links.md) |
| `discover.api-description` (group) | An agent can find a machine-readable description of the API | essential | api, webapp | [api-catalog](api-catalog.md) |
| - `discover.api-catalog` | An RFC 9727 API catalog is published |  |  | [source](https://www.rfc-editor.org/rfc/rfc9727) |
| - `discover.service-desc-link` | A service-desc link points to the API description |  |  | [source](https://www.rfc-editor.org/rfc/rfc8631) |
| - `discover.openapi-path` | An OpenAPI document is at a conventional path |  |  | [source](https://spec.openapis.org/oas/latest.html) |

### Read

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `read.content-without-js` (gate) | The entry page has its content in the HTML, with no JavaScript | essential | content, webapp, commerce | [server-rendering](server-rendering.md) |
| `read.vary-accept` | The Markdown response has a Vary header that contains Accept | optional | content, webapp, commerce | [markdown-for-agents](markdown-for-agents.md) |
| `read.markdown-parity` | The Markdown version has the content of the HTML page | optional | content, webapp, commerce | [markdown-for-agents](markdown-for-agents.md) |
| `read.metadata` | The entry page has a title, a meta description, and a language | recommended | content, webapp, commerce | [structured-data](structured-data.md) |
| `read.headings` | The entry page has one h1 heading and no skipped heading level | optional | content, webapp, commerce | [structured-data](structured-data.md) |
| `read.structured-data` | The entry page has JSON-LD structured data with a type | recommended | content, webapp, commerce | [structured-data](structured-data.md) |
| `read.page-weight` | The HTML of the entry page is 1 MB or smaller | recommended | content, webapp, commerce | [server-rendering](server-rendering.md) |
| `read.accessible-names` | The form controls of the entry page have accessible names | optional | content, webapp, commerce | [structured-data](structured-data.md) |
| `read.markdown` (group) | An agent can get a Markdown version of a page | recommended | content, webapp, commerce | [markdown-for-agents](markdown-for-agents.md) |
| - `read.markdown-negotiation` | The server returns Markdown for a request with Accept: text/markdown |  |  | [source](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1) |
| - `read.markdown-url` | A Markdown file for the page is at a .md URL |  |  | [source](https://llmstxt.org/) |

### Act

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `act.openapi-valid` | The API description is OpenAPI 3 with a title and operations | essential | api, webapp | [openapi-quality](openapi-quality.md) |
| `act.openapi-operations` | Each operation has an operationId and a summary or a description | recommended | api, webapp | [openapi-quality](openapi-quality.md) |
| `act.openapi-responses` | Each operation has a success schema and an error response | recommended | api, webapp | [openapi-quality](openapi-quality.md) |
| `act.openapi-security` | The API description declares how to authenticate | recommended | api, webapp | [openapi-quality](openapi-quality.md) |
| `act.openapi-examples` | Operations have request or response examples | optional | api, webapp | [openapi-quality](openapi-quality.md) |
| `act.mcp-endpoint` | An MCP server answers at /mcp | recommended | api, webapp | [mcp-server](mcp-server.md) |

### Authorize

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `authorize.protected-resource-metadata` | RFC 9728 metadata names the authorization server of the API | recommended | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| `authorize.pkce-s256` | The authorization server supports PKCE with the S256 method | recommended | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| `authorize.headless-grant` | The authorization server has a grant for a client with no browser | recommended | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| `authorize.scopes` | The metadata lists the supported scopes | optional | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| `authorize.server-metadata` (group) | An agent can discover the authorization server | essential | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| - `authorize.rfc8414-metadata` | RFC 8414 authorization server metadata is published |  |  | [source](https://www.rfc-editor.org/rfc/rfc8414) |
| - `authorize.oidc-discovery` | OpenID Connect discovery metadata is published |  |  | [source](https://openid.net/specs/openid-connect-discovery-1_0.html) |
| `authorize.client-registration` (group) | An agent can register as a client with no manual step | recommended | api, webapp | [oauth-for-agents](oauth-for-agents.md) |
| - `authorize.dynamic-registration` | The authorization server has an RFC 7591 registration endpoint |  |  | [source](https://www.rfc-editor.org/rfc/rfc7591) |
| - `authorize.client-id-metadata` | The authorization server accepts Client ID Metadata Documents |  |  | [source](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) |

### Recover

| ID | Check | Tier | Profiles | Fix |
| --- | --- | --- | --- | --- |
| `recover.honest-404` | A missing path returns a 404 status | essential | content, api, webapp, commerce | [errors-and-limits](errors-and-limits.md) |
| `recover.structured-errors` | An API error is an RFC 9457 problem details object | essential | api, webapp | [errors-and-limits](errors-and-limits.md) |
| `recover.cache-validators` | The entry response has a cache validator | optional | content, webapp, commerce | [errors-and-limits](errors-and-limits.md) |

## Review checks

The scanner cannot measure these checks. The agent assesses them with evidence. They do not change the AX Score.

### `reach.verified-agents`: The bot protection lets verified agents through with no CAPTCHA

Tier: optional. Profiles: content, webapp, commerce. Fix: [bot-access](bot-access.md).

An agent cannot solve a CAPTCHA, so the bot protection must identify a legitimate agent by a different method.

- **Pass:** The CDN or the WAF verifies agents by a Web Bot Auth signature or by a vendor list of verified bots. A verified agent gets the page with no challenge.
- **Partial:** An allow rule exists, but it matches only the user-agent string, or it does not include each agent that the owner permits.
- **Fail:** The bot protection challenges or blocks each automated client, and it has no rule for verified agents.
- **Evidence to collect:** The bot settings of the CDN or the WAF, the rule that allows verified agents, and the log of one verified request.

### `read.pricing`: An agent can read the prices and the plan limits with no JavaScript and no login

Tier: recommended. Profiles: api, webapp, commerce. Fix: [structured-data](structured-data.md).

An agent that compares products for a person needs the real prices, and it cannot log in or speak to a sales team.

- **Pass:** A public first-party page gives each price and each plan limit as text or structured data in the first HTML response. No login and no "contact sales" step hides a price. An agent can compare the plans from that page.
- **Partial:** The prices are public, but an agent cannot get all of them from the first HTML response. Examples: JavaScript loads the prices, an image shows them, the plan limits are absent, or one plan has no public price.
- **Fail:** No public first-party page gives the prices. The prices are behind a login or a "contact sales" form, or only third-party sites show them.
- **Evidence to collect:** The URL of the pricing page. The price and the limits of each plan, as read from the HTML with no JavaScript or from the JSON-LD. Each plan with no public price.

### `act.mcp-tools`: The MCP tools are easy for a model to select and call

Tier: recommended. Profiles: api, webapp. Fix: [mcp-server](mcp-server.md).

A model selects a tool only from its name, its description, and its schema. No human is there to explain a tool.

- **Pass:** Each tool has a clear name, a description that says when to use it, and a typed input schema with a description for each parameter. Each tool has annotations for read-only and destructive behaviour. The server has a small set of tools that match user tasks.
- **Partial:** The tools have names and typed schemas. But some descriptions do not say when to use the tool, some parameters have no description, or the annotations are absent.
- **Fail:** The product has no MCP server. Or the tools have no description or no typed input schema. Or the server has too many tools for a model to select the correct one.
- **Evidence to collect:** Call `tools/list` on the MCP server. Record the number of tools. For each tool, record the name, the description, the `inputSchema`, and the annotations `readOnlyHint` and `destructiveHint`.

### `act.safe-retries`: An agent can retry a write with no duplicate effect

Tier: recommended. Profiles: api, webapp. Fix: [api-design](api-design.md).

An agent retries after a timeout. If the first request succeeded, a retry with no protection creates a second order or a second payment.

- **Pass:** Each write operation that is not idempotent accepts an `Idempotency-Key` header. The documentation states how long the server keeps a key and what a repeated key returns. The other write operations are idempotent, for example `PUT` and `DELETE`.
- **Partial:** Some write operations accept an idempotency key and others do not. Or the header exists, but the documentation does not state the behaviour for a repeated key.
- **Fail:** A `POST` operation that creates a resource or moves money accepts no idempotency key, so a retry after a timeout can create a duplicate.
- **Evidence to collect:** Read the API description and the documentation. Find the `POST` and `PATCH` operations that create or change resources. Record which of them accept an `Idempotency-Key` header, and the documented behaviour for a repeated key.

### `act.pagination`: List operations have cursor pagination with a documented limit

Tier: optional. Profiles: api, webapp. Fix: [api-design](api-design.md).

An agent must get all the items of a list with no gaps and no duplicates, and it cannot see a "next page" button.

- **Pass:** Each list operation uses cursor pagination and has a `limit` parameter with a documented default and maximum. The response gives the cursor of the next page. The order of the items is stable and documented.
- **Partial:** The list operations have pagination, but they use page numbers or offsets, or the limit or the order has no documentation.
- **Fail:** A list operation returns all the items in one response. Or it returns a part of the items and gives no method to get the others.
- **Evidence to collect:** Find the operations that return an array. Record the pagination parameters, the default limit and the maximum limit, the response field for the next cursor, and the documented order.

### `act.cli-or-sdk`: A CLI or an SDK lets an agent act with no browser

Tier: optional. Profiles: api, webapp. Fix: [api-design](api-design.md).

An agent in a terminal completes a task faster with one command than with HTTP requests that it builds from the documentation.

- **Pass:** The product has an official CLI with a non-interactive mode and JSON output, or an official SDK. The documentation shows how to authenticate with no browser.
- **Partial:** A CLI or an SDK exists, but the CLI needs interactive prompts or a browser login, or it has no machine-readable output.
- **Fail:** The product has no CLI and no SDK, so an agent must build each HTTP request from the documentation or use the web interface.
- **Evidence to collect:** Read the documentation and the package registries for an official CLI or SDK. Record the flags for non-interactive use and for JSON output, and the authentication method.

### `authorize.self-serve-credentials`: An agent can get working credentials with no human step

Tier: essential. Profiles: api, webapp. Fix: [self-serve-access](self-serve-access.md).

An agent cannot solve a CAPTCHA, read a verification email, or join a sales call, so each manual step stops it.

- **Pass:** An agent gets working credentials through an API, a CLI, or OAuth with automatic client registration. The flow has no CAPTCHA, no email or phone verification that needs a person, and no sales call.
- **Partial:** An agent can create keys or tokens through an API or a CLI. A person must first complete one step, for example the signup or an email verification.
- **Fail:** A person must use a dashboard, solve a CAPTCHA, or speak to a sales team before a credential exists.
- **Evidence to collect:** Read the signup and authentication documentation. Record each step from no account to a working credential. Mark each step that needs a person. Do not create an account on a live site unless the owner approves it.

### `authorize.sandbox`: A sandbox or a test mode lets an agent try a write with no real effect

Tier: recommended. Profiles: api, webapp. Fix: [self-serve-access](self-serve-access.md).

An agent must try a write operation before it changes real data, because no human is there to undo an error.

- **Pass:** The documentation describes a test mode or a sandbox with test credentials. An agent can get the test credentials with no human step, and a write in that mode has no real effect.
- **Partial:** A sandbox or a test mode exists, but a person must request access to it, or it does not support the write operations.
- **Fail:** The product has no test mode and no sandbox, so each write changes real data.
- **Evidence to collect:** Search the documentation for "sandbox", "test mode", and "test key". Record how an agent gets test credentials and which operations the sandbox supports.

### `recover.rate-limits`: The API tells an agent its limits and when to try again

Tier: recommended. Profiles: api, webapp. Fix: [errors-and-limits](errors-and-limits.md).

An agent that does not know the limit sends requests until the API blocks it, and then cannot tell when to continue.

- **Pass:** Each response has RateLimit and RateLimit-Policy headers, or X-RateLimit headers. A 429 response has a Retry-After header.
- **Partial:** Only one of the two exists: the limit headers on each response, or the Retry-After header on a 429 response.
- **Fail:** No response has limit headers, and a 429 response has no Retry-After header.
- **Evidence to collect:** The headers of one authenticated response, the headers of one 429 response, and the rate limit section of the API documentation.

### `recover.actionable-errors`: An error message tells an agent how to correct the request

Tier: recommended. Profiles: api, webapp. Fix: [errors-and-limits](errors-and-limits.md).

An agent has no human to ask, so the error must contain all that the agent needs for the next attempt.

- **Pass:** A validation error names the field that failed, gives the reason and the valid values, and says how to correct the request.
- **Partial:** The error names the field or the rule that failed, but it gives no valid values and no correction.
- **Fail:** The error is a generic message, for example "Bad Request", or it shows a stack trace.
- **Evidence to collect:** The error bodies for an invalid parameter, a missing required field, and an unknown resource ID, from the API tests or from read-only requests.

## Watch checks

These checks are for emerging standards, legacy paths, and observations. They do not change the AX Score.

| ID | Check | Standard | Reviewed | Specification | Fix |
| --- | --- | --- | --- | --- | --- |
| `reach.content-signals` | robots.txt declares Content Signals | emerging | 2026-11 | [source](https://contentsignals.org/) | [bot-access](bot-access.md) |
| `reach.aipref` | The site declares AI usage preferences with Content-Usage | emerging | 2026-11 | [source](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/) | [bot-access](bot-access.md) |
| `reach.training-crawler-policy` | robots.txt sets the access of AI training crawlers | stable |  | [source](https://www.rfc-editor.org/rfc/rfc9309) | [bot-access](bot-access.md) |
| `reach.branded-agent-fetch` | The user-agent string of a user-directed agent gets the same status as a plain request | stable |  | [source](https://www.rfc-editor.org/rfc/rfc9110) | [bot-access](bot-access.md) |
| `discover.mcp-server-card` | An MCP Server Card is published | emerging | 2026-11 | [source](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) | [agent-discovery](agent-discovery.md) |
| `discover.ai-catalog` | A catalog of agent resources is published | emerging | 2026-11 | [source](https://agenticresourcediscovery.org/spec/) | [agent-discovery](agent-discovery.md) |
| `discover.mcp-well-known` | A legacy MCP document is at a /.well-known/mcp path | legacy | 2026-11 | [source](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) | [agent-discovery](agent-discovery.md) |
| `discover.agent-skills` | An Agent Skills index is published | emerging | 2026-11 | [source](https://github.com/cloudflare/agent-skills-discovery-rfc) | [agent-discovery](agent-discovery.md) |
| `discover.a2a-agent-card` | An A2A agent card is published | stable |  | [source](https://a2a-protocol.org/latest/specification/) | [agent-discovery](agent-discovery.md) |
| `discover.llms-full-txt` | llms-full.txt is published | stable |  | [source](https://llmstxt.org/) | [llms-txt](llms-txt.md) |
| `act.webmcp` | The page declares WebMCP tools for browser agents | emerging | 2026-11 | [source](https://webmachinelearning.github.io/webmcp/) | [webmcp](webmcp.md) |
| `authorize.auth-md` | An auth.md file tells an agent how to register | emerging | 2026-11 | [source](https://workos.com/auth-md/docs/auth-md) | [self-serve-access](self-serve-access.md) |
| `recover.deprecation-headers` | Deprecation and Sunset headers announce the end of an API version | stable |  | [source](https://www.rfc-editor.org/rfc/rfc9745) | [errors-and-limits](errors-and-limits.md) |
| `transact.acp` | An Agentic Commerce Protocol discovery document is published | emerging | 2026-11 | [source](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/rfcs/rfc.discovery.md) | [agentic-commerce](agentic-commerce.md) |
| `transact.ucp` | A Universal Commerce Protocol profile is published | emerging | 2026-11 | [source](https://ucp.dev/specification/overview/) | [agentic-commerce](agentic-commerce.md) |
| `transact.ap2` | The UCP profile declares the AP2 mandates capability | emerging | 2026-11 | [source](https://ucp.dev/specification/payment/extensions/ap2-mandates/) | [agentic-commerce](agentic-commerce.md) |
| `transact.x402` | The entry URL gives an x402 payment requirement | emerging | 2026-11 | [source](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md) | [agentic-commerce](agentic-commerce.md) |
| `transact.mpp` | The API gives a Machine Payments Protocol challenge or payment terms | emerging | 2026-11 | [source](https://datatracker.ietf.org/doc/draft-httpauth-payment/) | [agentic-commerce](agentic-commerce.md) |
