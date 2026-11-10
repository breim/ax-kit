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

## Review checks

The scanner cannot measure these checks. The agent assesses them with evidence. They do not change the AX Score.

## Watch checks

These checks are for emerging standards, legacy paths, and observations. They do not change the AX Score.

| ID | Check | Standard | Reviewed | Specification | Fix |
| --- | --- | --- | --- | --- | --- |
| `discover.mcp-server-card` | An MCP Server Card is published | emerging | 2026-11 | [source](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) | [agent-discovery](agent-discovery.md) |
| `discover.ai-catalog` | A catalog of agent resources is published | emerging | 2026-11 | [source](https://agenticresourcediscovery.org/spec/) | [agent-discovery](agent-discovery.md) |
| `discover.mcp-well-known` | A legacy MCP document is at a /.well-known/mcp path | legacy | 2026-11 | [source](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) | [agent-discovery](agent-discovery.md) |
| `discover.agent-skills` | An Agent Skills index is published | emerging | 2026-11 | [source](https://github.com/cloudflare/agent-skills-discovery-rfc) | [agent-discovery](agent-discovery.md) |
| `discover.a2a-agent-card` | An A2A agent card is published | stable |  | [source](https://a2a-protocol.org/latest/specification/) | [agent-discovery](agent-discovery.md) |
| `discover.llms-full-txt` | llms-full.txt is published | stable |  | [source](https://llmstxt.org/) | [llms-txt](llms-txt.md) |
