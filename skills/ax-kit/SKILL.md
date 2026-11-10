---
name: ax-kit
description: Improve the Agent Experience (AX) of a website, API, SaaS app, or store, so that AI agents can reach it, discover it, read it, call it, get access, and recover from errors with no human present. Use when the user wants to make a product agent-ready or agent-friendly, or wants to add llms.txt, Markdown for agents, an API catalog, a better OpenAPI file, an MCP server, WebMCP, OAuth for agents, self-serve API keys, structured errors, robots.txt rules for AI bots, or agentic commerce. Also use to audit a URL, to get an AX Score from the bundled scanner, to review the design of an API or a feature for agents, or to add a CI gate on the score. Not for SEO ranking, not for citations in AI answers, and not for making a code repository easier for coding agents.
license: MIT
compatibility: Requires Node.js 18 or later for the bundled scanner, and network access to the target site.
metadata:
  author: breim
  version: "0.1.0"
  argument-hint: "[improve | add <capability> | audit <url> | score <url> | design | ci]"
---

# AX Kit

UX is the experience of a human. Agent Experience (AX) is the experience of an AI agent that uses a product for a person.
An agent has no eyes, no patience for a CAPTCHA, and no human to ask. It can only use what the product exposes to a machine.

This skill improves the agent-facing layer of a site, an API, a SaaS app, or a store.
It implements the standards that agents use, and it measures the result with a scanner.
The score is the feedback for the work. The score is not the goal.

## Setup

`<skill-dir>` is the directory that contains this `SKILL.md`. Keep the working directory in the project of the user.

The scanner is `<skill-dir>/scripts/ax.mjs`. It needs Node.js 18 or later and has no dependencies.

```bash
node <skill-dir>/scripts/ax.mjs scan <url> --profile <content|api|webapp|commerce> --json
```

If `node` is missing or older than version 18, tell the user. Then continue with the playbooks and without the scanner.

## Commands

Find the command in the request of the user. Then read the guide for that command and follow it.

| Command | Use it when the user wants to | Guide | Edits code |
|---|---|---|---|
| `improve` | Make the product better for agents, with a loop of scan, fix, and verify | [references/improve.md](references/improve.md) | Yes |
| `add <capability>` | Implement one capability, for example `llms-txt` or `mcp-server` | [references/add.md](references/add.md) | Yes |
| `audit <url>` | Get a full diagnosis and a report, with no changes | [references/audit.md](references/audit.md) | No |
| `score <url>` | Get the AX Score and the top gaps quickly | [references/score.md](references/score.md) | No |
| `design` | Review a planned API, site, or feature before the code exists | [references/design.md](references/design.md) | No |
| `ci` | Add a pipeline gate on the score, and a badge | [references/ci.md](references/ci.md) | Yes |

If the request names no command and you cannot infer one, show this table and ask which command the user wants.
Do not start work from the menu.

## Rules that apply to all commands

These rules are stronger than the reference files.

1. **Confirm before you edit.** Show the list of changes. Edit only after the user agrees.
2. **Stay read-only on a live site.** Send only requests that read data. Do not create an account, submit a form, or buy something. The owner of the site can approve an exception in plain words.
3. **Ask before you use an external scanner.** A hosted scanner receives the URL. Get consent first.
4. **Protect security.** Do not disable bot protection, open CORS for private data, or expose private content to increase a score. Each playbook has security notes. Obey them.
5. **Respect the bot policy of the owner.** A block on AI training crawlers is a valid decision. Do not change it unless the user asks.
6. **Check the date of a standard.** Each playbook has a `Reviewed` date. If that date is more than 6 months old, read the primary source before you implement.
7. **Report the truth.** Show the score, the coverage, and each check that the scanner did not assess. Do not show an unassessed check as a pass.
8. **Fix the cause.** Do not add a file only to satisfy a check. An `llms.txt` with wrong links is worse than no file.

## The seven pillars

The pillars follow the journey of an agent. A failure in an early pillar blocks the pillars after it.

| Pillar | Question | Playbooks |
|---|---|---|
| Reach | Can an agent get a response, and is the bot policy explicit? | `bot-access` |
| Discover | Can an agent find what exists? | `llms-txt`, `sitemap-and-links`, `api-catalog`, `agent-discovery` |
| Read | Can an agent understand the content with no browser? | `markdown-for-agents`, `server-rendering`, `structured-data` |
| Act | Can an agent call the product? | `openapi-quality`, `mcp-server`, `webmcp`, `api-design` |
| Authorize | Can an agent get access with no human present? | `oauth-for-agents`, `self-serve-access` |
| Recover | Can an agent correct itself after an error? | `errors-and-limits` |
| Transact | Can an agent pay? | `agentic-commerce` |

Each playbook is the file `references/<name>.md`.

## Profiles

A profile tells the scanner which checks apply. Give the profile with `--profile`. If you omit it, the scanner detects it.

| Profile | Target |
|---|---|
| `content` | A marketing site, a documentation site, or a blog |
| `api` | An HTTP API |
| `webapp` | A SaaS application with accounts |
| `commerce` | A store |

A product can have more than one surface. Scan each surface with its own profile.
Example: scan `example.com` as `content`, and scan `api.example.com` as `api`.

## How to read the scanner output

The JSON report has three buckets of checks.

| Bucket | Content | Effect on the score |
|---|---|---|
| `score` | Measured checks on stable standards | All of the score |
| `review` | Checks that need judgment, for example "an agent can get an API key with no CAPTCHA" | None. You assess them. |
| `watch` | Emerging standards, legacy paths, and observations | None |

- `score` is a verified lower bound from 0 to 100. `upperBound` is the score if each unassessed check passes.
- `coverage` shows how much of the score the scanner could assess. A timeout decreases it.
- `grade` is `null` when `score` and `upperBound` are in different grade bands.
- `cap` is set when a gate fails. A gate fails when a plain request gets a bot challenge, or when the page has no content without JavaScript. The cap is 59.
- `opportunities` lists the points that each fix can add, largest first.
- Each check has a `playbook`. That is the reference file with the fix.

Exit codes: 0 ok, 1 gate failed, 2 usage error, 3 gate inconclusive, 4 no score, 5 internal error.

For the formula, read [references/scoring.md](references/scoring.md). For the list of checks, read [references/checks.md](references/checks.md).

## Reference files

Read a file only when the condition is true.

| File | Read it when |
|---|---|
| [references/stacks.md](references/stacks.md) | You must find where a file, a header, or a route goes in the framework of the project |
| [references/standards.md](references/standards.md) | You must know if a standard is stable, emerging, or legacy, or if a path changed its name |
| [references/checks.md](references/checks.md) | You need the meaning of a check ID, or the rubric of a review check |
| [references/scoring.md](references/scoring.md) | The user asks how the score works |
| `references/<playbook>.md` | You implement or explain the capability of that playbook |

Templates for common files are in `<skill-dir>/assets/`. Each playbook names the template that it uses.
