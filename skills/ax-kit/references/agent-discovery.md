# Agent discovery documents

- **Reviewed:** 2026-11
- **Pillar:** Discover
- **Checks (all Watch):** group `discover.mcp` = `discover.mcp-server-card`, `discover.ai-catalog`; `discover.agent-skills`; `discover.a2a-agent-card`; `discover.mcp-well-known` (legacy)
- **Templates:** `assets/server-card.json`, `assets/ai-catalog.json`, `assets/agent-skills-index.json`

## Why agents need it

An agent that knows only a domain must find what the domain offers to agents: an MCP server, a set of skills, or an agent to talk to.
Discovery documents answer that question at known locations, before the agent opens a connection.

All the standards in this playbook are young. They are Watch checks: they do not change the AX Score.
Implement them when the product has the thing that they describe. Do not publish an empty document.

## Status of the standard

| Document | Status in 2026-11 | Source |
|---|---|---|
| MCP Server Card | SEP-2127, Final, an official MCP extension | <https://modelcontextprotocol.io/seps/2127-mcp-server-cards> |
| AI Catalog (`ai-catalog.json`) | Used by the MCP Server Card extension | <https://github.com/modelcontextprotocol/ext-server-card> |
| ARD (`ard.json`) | Proposal, version 0.91. It names `ai-catalog.json` as its predecessor. | <https://agenticresourcediscovery.org/spec/> |
| Agent Skills index | Draft, version 0.2.0 | <https://github.com/cloudflare/agent-skills-discovery-rfc> |
| A2A agent card | A2A version 1.0.0, stable | <https://a2a-protocol.org/latest/specification/> |

The two catalog documents conflict on the path. Publish the same entries at both paths until one source changes.

## Implement

### 1. MCP Server Card

Use this when the product has a remote MCP server. See [mcp-server.md](mcp-server.md).

- Location: `<mcp-endpoint>/server-card`. For an endpoint at `https://acme.example/mcp`, the card is at `https://acme.example/mcp/server-card`.
- Media type: `application/mcp-server-card+json`.
- Required fields: `$schema`, `name`, `version`, `description`.
- `name` has the form `namespace/server`, with one slash.
- The card describes how to connect. It does not list tools, resources, or prompts. A client gets those from the live server.

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "example.acme/invoices",
  "version": "1.0.0",
  "description": "Create, send, and track invoices.",
  "title": "Acme Invoices",
  "websiteUrl": "https://acme.example",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://acme.example/mcp",
      "supportedProtocolVersions": ["2026-07-28", "2025-11-25"]
    }
  ]
}
```

The card endpoint must send these headers:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Content-Type, If-None-Match
Access-Control-Expose-Headers: ETag
```

It should also send `Cache-Control: public, max-age=3600` and an `ETag`, and answer `If-None-Match` with status 304.

### 2. Catalog of agent resources

The catalog tells an agent which resources the domain has. Publish it at both paths:

- `/.well-known/ard.json` (ARD, current)
- `/.well-known/ai-catalog.json` (predecessor, used by the MCP extension)

Each entry needs `identifier`, `displayName`, `type`, and exactly one of `url` or `data`.

```json
{
  "specVersion": "1.0",
  "entries": [
    {
      "identifier": "urn:air:acme.example:mcp:invoices",
      "displayName": "Acme Invoices MCP server",
      "type": "application/mcp-server-card+json",
      "url": "https://acme.example/mcp/server-card"
    }
  ]
}
```

To announce a catalog at a different path, add one of these:

- In `robots.txt`: `Agentmap: https://acme.example/.well-known/ard.json`
- In the HTML head: `<link rel="ard" href="/.well-known/ard.json">`

### 3. Agent Skills index

Use this when the product has skills that teach an agent how to use it.

- Path: `/.well-known/agent-skills/index.json`.
- `$schema` must be `https://schemas.agentskills.io/discovery/0.2.0/schema.json`.
- Each skill needs `name`, `type`, `description`, `url`, and `digest`.
- `type` is `skill-md` for one `SKILL.md` file, or `archive` for an archive.
- `digest` is `sha256:` and the 64 lowercase hex characters of the SHA-256 of the file bytes.

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "acme-invoices",
      "type": "skill-md",
      "description": "Create and send invoices with the Acme API. Use when the user asks for an invoice.",
      "url": "/.well-known/agent-skills/acme-invoices/SKILL.md",
      "digest": "sha256:<64 hex characters>"
    }
  ]
}
```

Compute the digest in the build, from the file that you publish:

```bash
shasum -a 256 SKILL.md
```

### 4. A2A agent card

Use this only when the product runs an agent that other agents call with the A2A protocol.

- Path: `/.well-known/agent-card.json`.
- Required fields: `name`, `description`, `version`, `supportedInterfaces`, `capabilities`, `defaultInputModes`, `defaultOutputModes`, `skills`.
- Each interface needs `url`, `protocolBinding`, and `protocolVersion`.
- Each skill needs `id`, `name`, `description`, and `tags`.

A site with no A2A agent does not need this file.

### 5. Legacy paths

Some scanners request `/.well-known/mcp.json` or `/.well-known/mcp/server-card.json`.
The MCP specification does not define these paths. SEP-2127 puts the card at `<mcp-endpoint>/server-card`.
You can serve a copy of the card at a legacy path for those scanners. Do not use a legacy path as the only location.

## Stack notes

- Each document is a small JSON file. Serve it from a route, so that the build can generate it and set the headers.
- **Static host:** set the `Content-Type` and the CORS headers for these paths in the host config.
- **Next.js:** a route handler below `app/.well-known/`. For the Server Card, add a route handler below the MCP route.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i -H 'Accept: application/mcp-server-card+json' https://<host>/mcp/server-card
curl -s https://<host>/.well-known/ard.json
curl -s https://<host>/.well-known/agent-skills/index.json
```

Run the scanner and read the `watch` part of the report. `adopted` lists the documents that it found.

## Security notes

- All these documents are public. Do not put credentials, internal host names, or user data in them.
- A card or a catalog is advice. A client must check each claim against the live server. Do not use a card to grant access.
- Open CORS is correct for these documents only, because they hold public metadata. Do not copy that CORS policy to the MCP endpoint or to the API.
- Publish a skill only after a review. An agent follows its instructions.

## Common mistakes

- **A Server Card that lists tools.** The format has no field for tools.
- **A digest that does not match the file.** A client rejects the skill. Compute the digest from the published bytes.
- **An entry with both `url` and `data`.** The entry is invalid.
- **A document that describes a server that does not exist.** An agent wastes requests, and the domain loses trust.
- **Only a legacy path.** A client that follows the specification does not find the card.
