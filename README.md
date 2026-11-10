# AX Kit

[![Test](https://github.com/breim/agent-experience/actions/workflows/test.yml/badge.svg)](https://github.com/breim/agent-experience/actions/workflows/test.yml)

**UX is for humans. AX is for agents.**

AX Kit is an agent skill that improves the Agent Experience (AX) of a website, an API, a SaaS app, or a store.
An AI agent that works for a person has no eyes, cannot solve a CAPTCHA, and has no human to ask.
It can use only what your product gives to a machine.

AX Kit helps your coding agent build that layer. It implements the standards that agents use, and it measures the result with a scanner.

```bash
npx skills add breim/agent-experience
```

The skill works with Claude Code, Codex, Cursor, Gemini CLI, and the other agents that the [skills CLI](https://skills.sh) supports.

## What it does

Ask your agent in plain words, or name a command.

| Command | What you get |
|---|---|
| `improve` | A loop: find the gaps, rank them, implement the fixes in your code, and verify each one. |
| `add <capability>` | One capability, implemented from a playbook. Example: `add llms-txt`, `add mcp-server`. |
| `audit <url>` | A full diagnosis with a report: the scanner, the checks that need judgment, and a cold-start agent journey. |
| `score <url>` | The AX Score and the top gaps, in seconds. |
| `design` | An AX review of an API, a site, or a feature before the code exists. |
| `ci` | A pipeline gate on the score, and a badge. |

Examples:

- "Make this app agent-ready." (`improve`)
- "Add an llms.txt and Markdown versions of the docs." (`add`)
- "Audit https://example.com for agents." (`audit`)
- "We are designing a new API. Review the plan for agents." (`design`)

## The seven pillars

The pillars follow the journey of an agent. A failure in an early pillar blocks the pillars after it.

| Pillar | Question | Playbooks |
|---|---|---|
| **Reach** | Can an agent get a response, and is the bot policy explicit? | `bot-access` |
| **Discover** | Can an agent find what exists? | `llms-txt`, `sitemap-and-links`, `api-catalog`, `agent-discovery` |
| **Read** | Can an agent understand the content with no browser? | `markdown-for-agents`, `server-rendering`, `structured-data` |
| **Act** | Can an agent call the product? | `openapi-quality`, `mcp-server`, `webmcp`, `api-design` |
| **Authorize** | Can an agent get access with no human present? | `oauth-for-agents`, `self-serve-access` |
| **Recover** | Can an agent correct itself after an error? | `errors-and-limits` |
| **Transact** | Can an agent pay? | `agentic-commerce` |

Each playbook is a file in [`skills/ax-kit/references/`](skills/ax-kit/references/). It gives the reason, the status of the standard with its source, and a minimal correct implementation. It also has notes for common stacks, the checks that prove the result, security notes, and common mistakes.

## The AX Score

The scanner gives one number from 0 to 100, a grade, and a list of gaps with the points that each fix can add.

```
$ node skills/ax-kit/scripts/ax.mjs scan https://example.com --profile content

AX Score  36 / 100   grade F   (upper bound 36, coverage 100%)
Target    https://example.com/
Profile   content (declared)

Pillars   Reach 11.43/20  >  Discover 0/30  >  Read 15/40  >  Recover 10/10

Top gaps (points that each fix can add)
  +10.00  discover.llms-txt  [references/llms-txt.md]
  +10.00  discover.sitemap  [references/sitemap-and-links.md]
  + 5.71  reach.robots-txt  [references/bot-access.md]
  + 5.00  discover.link-headers  [references/sitemap-and-links.md]
  ...
```

The model has four rules that keep the number honest:

1. **One meaning.** The score counts only checks that the scanner can measure, on stable standards. The same responses always give the same score.
2. **No free points.** A check that does not apply is not in the score. A check with no result counts as 0 in the score and appears in the coverage.
3. **Emerging standards do not cost points.** The report shows them in a Watch list.
4. **Two gates.** A bot challenge on a plain request, or a page with no content without JavaScript, limits the score to 59.

Many problems that matter most with no human present need judgment. Examples: a CAPTCHA at signup, or an error message that does not say how to correct the request.
The skill assesses these Review checks with evidence, and it reports them beside the score. It does not turn them into points.

Read [`scoring.md`](skills/ax-kit/references/scoring.md) for the model and [`checks.md`](skills/ax-kit/references/checks.md) for the full catalog.

## The scanner

The scanner is one Node script with no dependencies. It needs Node.js 18 or later. You can run it without an agent.

```bash
git clone https://github.com/breim/agent-experience.git
node agent-experience/skills/ax-kit/scripts/ax.mjs scan https://example.com --profile content
```

| Option | Purpose |
|---|---|
| `--profile content\|api\|webapp\|commerce` | The type of the target. If you omit it, the scanner detects it. |
| `--json` | The full report, with the evidence of each check. |
| `--min-score N` | An exit code for a pipeline. It needs `--profile`. |

The scanner is polite and read-only:

- It sends a maximum of 80 requests, 2 at a time.
- It uses `GET`, `HEAD`, and `OPTIONS`, and one read-only `POST` to find an MCP server.
- It runs on `localhost` and on private staging hosts, so you can scan before a release.
- It sends no telemetry.

## Standards change

The standards for agents changed many times in the last year. Each playbook has a review date and links to its primary source.
The skill tells the agent to read the source again when the review date is more than 6 months old.
[`standards.md`](skills/ax-kit/references/standards.md) lists each standard with its status: stable, emerging, or legacy.

## Limits

- The scanner reads the entry page and the well-known resources of one origin. It does not crawl the site.
- It does not run JavaScript. It detects WebMCP from the HTML only.
- It does not test flows behind a login, and it does not create accounts.
- A score is a measure of one surface. Scan the site, the documentation, and the API as separate targets.

## Development

```bash
npm test
```

The tests use `node:test` and a local fixture server. They need no network.
The check catalog is generated from the registry. After a change to a check, run `npm run catalog`.

## License

[MIT](LICENSE)
