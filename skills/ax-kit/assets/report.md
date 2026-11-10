# AX report: <site or product name>

- **Target:** <url>
- **Profile:** <profile>
- **Date:** <YYYY-MM-DD>
- **Scanner:** ax-kit <version>, registry <version>

## Summary

**AX Score: <score> / 100, grade <grade>.** Coverage <coverage>%. <Cap: none | Capped at 59 because of <gate>.>

<One sentence: the largest problem for an agent on this site.>

| Reach | Discover | Read | Act | Authorize | Recover |
|---|---|---|---|---|---|
| <points>/<weight> | <points>/<weight> | <points>/<weight> | <points>/<weight> | <points>/<weight> | <points>/<weight> |

## Blockers

<Each failed gate and each blocked journey stage. Write "None" if there is no blocker.>

## Findings

| # | Gap | Rank | Source | Points | Evidence | Fix |
|---|---|---|---|---|---|---|
| 1 | `<check id>` | <essential or recommended or optional> | <score or review or journey> | <points or n/a> | <what the scanner or the agent saw> | `references/<playbook>.md` |

## Review checks

| Check | Result | Evidence |
|---|---|---|
| `<check id>` | <pass or partial or fail or unknown> | <URL and quote, or file and line> |

## Journey

**Task:** <the main task, in one sentence>

| # | Stage | Request | Status | Size | Result | Note |
|---|---|---|---|---|---|---|
| 1 | Reach | `GET /` | <status> | <size> | <clear or friction or blocked> | <note> |

## Watch

- **Adopted:** <emerging standards that the site uses>
- **Next:** <emerging standards that fit this product>
- **Legacy paths:** <legacy paths that the scanner found>

## Not assessed

<Each check with no result, and the reason. Write "None" if the scanner assessed all checks.>

## Not covered by this audit

<Pages other than the entry page, flows behind a login, behavior under load, and other limits.>

## Next steps

1. <The first action, with the command: `improve`, or `add <capability>`.>
