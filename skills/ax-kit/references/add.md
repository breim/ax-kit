# add: implement one capability

This command implements one capability from a playbook. It does not need a scan first.

## Capabilities

| Capability | Playbook | What it adds |
|---|---|---|
| `bot-access` | [bot-access.md](bot-access.md) | An explicit AI policy in `robots.txt`, and access for user-directed agents |
| `llms-txt` | [llms-txt.md](llms-txt.md) | An `llms.txt` file that maps the site for agents |
| `sitemap-and-links` | [sitemap-and-links.md](sitemap-and-links.md) | A sitemap, and `Link` headers that point to agent resources |
| `api-catalog` | [api-catalog.md](api-catalog.md) | An RFC 9727 API catalog, and a published OpenAPI file |
| `agent-discovery` | [agent-discovery.md](agent-discovery.md) | An MCP Server Card, a catalog of agent resources, and an Agent Skills index |
| `markdown-for-agents` | [markdown-for-agents.md](markdown-for-agents.md) | A Markdown version of each page, by content negotiation and by URL |
| `server-rendering` | [server-rendering.md](server-rendering.md) | The main content in the first HTML response |
| `structured-data` | [structured-data.md](structured-data.md) | JSON-LD, metadata, a correct heading structure, and accessible names |
| `openapi-quality` | [openapi-quality.md](openapi-quality.md) | An OpenAPI file that an agent can use with no other documentation |
| `mcp-server` | [mcp-server.md](mcp-server.md) | A remote MCP server with well-designed tools |
| `webmcp` | [webmcp.md](webmcp.md) | Tools that a browser agent can call in the page |
| `api-design` | [api-design.md](api-design.md) | Pagination, safe retries, async jobs, and versioning |
| `oauth-for-agents` | [oauth-for-agents.md](oauth-for-agents.md) | OAuth discovery metadata, PKCE, and client registration with no manual step |
| `self-serve-access` | [self-serve-access.md](self-serve-access.md) | Credentials that an agent can get with no human, and a sandbox |
| `errors-and-limits` | [errors-and-limits.md](errors-and-limits.md) | Structured errors, rate-limit headers, and correct status codes |
| `agentic-commerce` | [agentic-commerce.md](agentic-commerce.md) | A payment protocol for agents, and machine-readable prices |

If the user names something that is not in this table, find the nearest playbook and tell the user which one you use.

## Procedure

1. **Read the playbook.** Check its `Reviewed` date. If the date is more than 6 months old, read the primary source first.
2. **Find the stack.** Read [stacks.md](stacks.md). Find where the files, the headers, and the routes go in this project.
3. **Look at what exists.** The project can have a part of the capability. Extend it. Do not add a second copy.
4. **Propose the change.** List each file that you will add or change. Get the agreement of the user.
5. **Implement.** Start from the template in `<skill-dir>/assets/` if the playbook names one. Replace all the example values with the real values of the project.
6. **Verify.** Run the app. Then run the scanner and look at the checks that the playbook names:

   ```bash
   node <skill-dir>/scripts/ax.mjs scan <url> --profile <profile> --json
   ```

7. **Report.** Give the files that you changed, the result of each check, and each step that the user must do outside the code.

## Rules

- Do not copy a template with its example values. A file with wrong data misleads an agent.
- Generate a file from the real data of the project when you can. Examples: build `llms.txt` from the routes, and build the OpenAPI file from the code.
- If the capability needs a decision of the owner, ask. Examples: which bots to allow, and which API operations are public.
