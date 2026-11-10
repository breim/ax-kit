# Standards: status and renamed paths

- **Reviewed:** 2026-11

This file lists each standard that the skill uses, with its status. Read it before you recommend a standard.
If the review date is more than 6 months old, read the primary source of the standard before you rely on a row.

## The three statuses

| Status | Meaning | In the scanner |
|---|---|---|
| Stable | An RFC, a released specification, or a format that did not change for a long time | A Score check |
| Emerging | A draft, a proposal, or a format of one vendor. It can change its name or its shape. | A Watch check |
| Legacy | An old path or name. A newer one replaced it. | A Watch check that reports the path |

Recommend a stable standard as a requirement. Present an emerging standard as an option, with its status.

## Reach

| Standard | Status | Source | Playbook |
|---|---|---|---|
| `robots.txt` | Stable (RFC 9309) | <https://www.rfc-editor.org/rfc/rfc9309> | `bot-access` |
| AI bot tokens for `robots.txt` | Stable, but each vendor changes its list | The documentation of each vendor | `bot-access` |
| Content Signals (`Content-Signal`) | Emerging. A convention from Cloudflare. | <https://contentsignals.org/> | `bot-access` |
| AI Preferences (`Content-Usage`) | Emerging. IETF AIPREF working group drafts. | <https://datatracker.ietf.org/wg/aipref/documents/> | `bot-access` |
| HTTP Message Signatures | Stable (RFC 9421) | <https://www.rfc-editor.org/rfc/rfc9421> | `bot-access` |
| Web Bot Auth | Emerging. IETF working group draft. | <https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/> | `bot-access` |

## Discover

| Standard | Status | Source | Playbook |
|---|---|---|---|
| XML sitemap | Stable | <https://www.sitemaps.org/protocol.html> | `sitemap-and-links` |
| `Link` header | Stable (RFC 8288) | <https://www.rfc-editor.org/rfc/rfc8288> | `sitemap-and-links` |
| `service-desc`, `service-doc`, `service-meta`, `status` relations | Stable (RFC 8631) | <https://www.rfc-editor.org/rfc/rfc8631> | `api-catalog` |
| API catalog (`/.well-known/api-catalog`) | Stable (RFC 9727) | <https://www.rfc-editor.org/rfc/rfc9727> | `api-catalog` |
| `llms.txt` | Stable format. A community proposal, not a standard of a standards body. | <https://llmstxt.org/> | `llms-txt` |
| `llms-full.txt` | A convention with no specification | none | `llms-txt` |
| MCP Server Card | Emerging. SEP-2127, an official MCP extension. | <https://modelcontextprotocol.io/seps/2127-mcp-server-cards> | `agent-discovery` |
| AI Catalog (`/.well-known/ai-catalog.json`) | Emerging | <https://github.com/modelcontextprotocol/ext-server-card> | `agent-discovery` |
| ARD (`/.well-known/ard.json`) | Emerging. Proposal, version 0.91. | <https://agenticresourcediscovery.org/spec/> | `agent-discovery` |
| Agent Skills index | Emerging. Draft, version 0.2.0. | <https://github.com/cloudflare/agent-skills-discovery-rfc> | `agent-discovery` |
| A2A agent card | Stable (A2A 1.0.0). Only for a site that runs an A2A agent. | <https://a2a-protocol.org/latest/specification/> | `agent-discovery` |

## Read

| Standard | Status | Source | Playbook |
|---|---|---|---|
| Content negotiation with `Accept` and `Vary` | Stable (RFC 9110) | <https://www.rfc-editor.org/rfc/rfc9110> | `markdown-for-agents` |
| `.md` URL for the Markdown version of a page | A convention from the `llms.txt` proposal | <https://llmstxt.org/> | `markdown-for-agents` |
| JSON-LD with schema.org types | Stable | <https://schema.org/> | `structured-data` |
| Accessible names of controls | Stable (HTML and WAI-ARIA) | <https://www.w3.org/TR/accname-1.2/> | `structured-data` |

## Act

| Standard | Status | Source | Playbook |
|---|---|---|---|
| OpenAPI 3 | Stable | <https://spec.openapis.org/oas/latest.html> | `openapi-quality` |
| Model Context Protocol, revision `2026-07-28` | Stable | <https://modelcontextprotocol.io/specification/2026-07-28> | `mcp-server` |
| WebMCP | Emerging. W3C Community Group draft, Chrome origin trial. | <https://webmachinelearning.github.io/webmcp/> | `webmcp` |
| `Idempotency-Key` header | Emerging. IETF draft. Many APIs use it. | <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/> | `api-design` |

## Authorize

| Standard | Status | Source | Playbook |
|---|---|---|---|
| Authorization server metadata | Stable (RFC 8414) | <https://www.rfc-editor.org/rfc/rfc8414> | `oauth-for-agents` |
| OpenID Connect Discovery | Stable | <https://openid.net/specs/openid-connect-discovery-1_0.html> | `oauth-for-agents` |
| Protected resource metadata | Stable (RFC 9728) | <https://www.rfc-editor.org/rfc/rfc9728> | `oauth-for-agents` |
| PKCE | Stable (RFC 7636) | <https://www.rfc-editor.org/rfc/rfc7636> | `oauth-for-agents` |
| Dynamic Client Registration | Stable (RFC 7591). MCP deprecated it in favor of Client ID Metadata Documents. | <https://www.rfc-editor.org/rfc/rfc7591> | `oauth-for-agents` |
| Client ID Metadata Documents | Emerging. IETF draft. MCP prefers it. | <https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/> | `oauth-for-agents` |
| Device authorization grant | Stable (RFC 8628) | <https://www.rfc-editor.org/rfc/rfc8628> | `oauth-for-agents` |
| `auth.md` | Emerging. A convention of one vendor. | <https://workos.com/auth-md/docs/auth-md> | `self-serve-access` |

## Recover

| Standard | Status | Source | Playbook |
|---|---|---|---|
| Problem Details for HTTP APIs | Stable (RFC 9457) | <https://www.rfc-editor.org/rfc/rfc9457> | `errors-and-limits` |
| `Retry-After` header | Stable (RFC 9110) | <https://www.rfc-editor.org/rfc/rfc9110> | `errors-and-limits` |
| `RateLimit` and `RateLimit-Policy` headers | Emerging. IETF draft. | <https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/> | `errors-and-limits` |
| `Deprecation` header | Stable (RFC 9745) | <https://www.rfc-editor.org/rfc/rfc9745> | `errors-and-limits` |
| `Sunset` header | Stable (RFC 8594) | <https://www.rfc-editor.org/rfc/rfc8594> | `errors-and-limits` |

## Transact

All the payment protocols for agents are emerging. Read the current specification before an implementation.

| Standard | Source | Playbook |
|---|---|---|
| Agentic Commerce Protocol (ACP) | <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol> | `agentic-commerce` |
| Universal Commerce Protocol (UCP) | <https://ucp.dev/specification/overview/> | `agentic-commerce` |
| x402 | <https://github.com/x402-foundation/x402> | `agentic-commerce` |
| Machine Payments Protocol (MPP) | <https://mpp.dev/protocol> | `agentic-commerce` |
| Agent Payments Protocol (AP2) | <https://ap2-protocol.org/> | `agentic-commerce` |

## Renamed and replaced

Old documentation and some scanners use the old name. Use the current name.

| Old | Current | Note |
|---|---|---|
| `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json` | `<mcp-endpoint>/server-card` | The MCP specification never defined the well-known paths. |
| MCP `initialize` handshake and `Mcp-Session-Id` | Stateless requests and `server/discover` | Changed in revision `2026-07-28`. |
| MCP HTTP+SSE transport | Streamable HTTP | The old transport is deprecated. |
| `/.well-known/ai-catalog.json` | `/.well-known/ard.json` | The two sources conflict. Publish both. |
| `/.well-known/skills/` | `/.well-known/agent-skills/` | Changed in version 0.2.0 of the draft. |
| `/.well-known/agent.json` | `/.well-known/agent-card.json` | The A2A agent card. |
| `navigator.modelContext` | `document.modelContext` | WebMCP. |
| `middleware.ts` in Next.js | `proxy.ts` | Changed in Next.js 16. |
| `X-RateLimit-*` headers | `RateLimit` and `RateLimit-Policy` | The old headers have no standard. Many APIs still send them. |

## Not covered by this skill

These proposals exist. The skill does not check them, because their adoption is low or their drafts expired.

- DNS-based agent discovery (DNS-AID).
- NLWeb.
- `agents.json` and `agents.txt`.
- TDM Reservation Protocol (TDMRep) and Really Simple Licensing (RSL).
