# improve: the improvement loop

This command makes a product better for agents. It finds the gaps, ranks them, implements the fixes, and verifies each fix.
The loop does not chase the score. A gap that needs judgment has the same rank as a gap that the scanner measures.

## 1. Find the target and the profile

1. If the user gave a URL, use it.
2. If the user gave no URL, find only how the project starts. Read the scripts in `package.json` or the run section of the `README`. Do not read the code yet, because the journey of step 4 must be a cold start.
3. Ask the user to confirm the start command, or to give a preview URL.
4. Ask the user for the production URL. A CDN or a WAF changes the Reach results, so scan production one time.
5. Prefer a local or a preview target for the loop. You can verify each change there before it goes to production.
6. Choose the profile: `content`, `api`, `webapp`, or `commerce`. If the product has more than one surface, list the surfaces and run the loop for each one.

## 2. Take the baseline

```bash
node <skill-dir>/scripts/ax.mjs scan <url> --profile <profile> --json
```

- Keep the JSON report in the conversation, or in a temporary directory outside the project. You compare the final report with it.
- If the exit code is 4, the scanner could not reach the target. Stop and tell the user.
- If `cap` is set, a gate failed. That gate is the first item of the worklist.

## 3. Run the journey

Attempt the main task of the product as an agent that knows nothing about it.
The protocol is in [audit.md](audit.md), in the section "The cold-start journey".
Record each stage as `clear`, `friction`, `blocked`, or `not reached`.

Do the journey before you read the code. Use only what the site returns.

## 4. Assess the Review checks

The scanner cannot measure these checks. You assess them with evidence.

1. Get the rubrics: `node <skill-dir>/scripts/ax.mjs catalog --json`. Use the checks in the `review` list of the report.
2. For each check, find evidence in the code or on the site. Give a file path and a line, or a URL.
3. Give one result: `pass`, `partial`, `fail`, `n/a`, or `unknown`. Use the rubric of the check.
4. Use `n/a` only when the check cannot apply, and give the reason. Example: `read.pricing` for a product that is free and has no limits.
5. If you find no evidence, the result is `unknown`. Do not guess. Ask the user one question for each `unknown` result that is essential.

Evidence rules:

- On a local target, evidence from the code is valid. Say that it comes from the code.
- Use a credential only when the user gives it to you for this work. Do not use a key that you find in the code.
- A package registry or another outside service receives your query. Ask the user before you use one (rule 3 of `SKILL.md`).

## 5. Build the worklist

Put all the gaps in one list. A gap is one of these:

- A Score check with the status `fail` or `partial`.
- A Review check with the result `fail` or `partial`.
- A journey stage with the result `friction` or `blocked`.

Rank the list in this order:

1. **Blockers:** a failed gate, or a journey stage that is `blocked`.
2. **Essential** checks.
3. **Recommended** checks.
4. **Optional** checks.

Inside one rank:

- Put a check before each check that names it in `blockedBy`. A check with `blockedBy` cannot pass before its cause passes.
- Then put the check with more points first. The points are in `opportunities`.
- A Review check has no points. Put it after the Score checks of the same rank.

A journey stage that is `friction` gets the rank of the check that causes it. A journey row has no points. Give it the playbook of the check that causes it, and name that check. If one fix closes a journey row and a check row, keep both rows and link them.

Show the worklist to the user as a table:

| # | Gap | Source | Rank | Points | Playbook | Effort |
|---|---|---|---|---|---|---|
| 1 | Journey stage Discover is `blocked` (closes with #3) | journey | blocker | n/a | `api-catalog` | small |
| 2 | `read.content-without-js` | score (gate) | blocker | 11.25 | `server-rendering` | large |
| 3 | `discover.api-description` | score | essential | 10.00 | `api-catalog` | small |
| 4 | `authorize.self-serve-credentials` | review | essential | n/a | `self-serve-access` | medium |

Effort is your estimate: small (one file), medium (some files), or large (a design change).

## 6. Agree on the gaps

Propose the first batch: all the blockers and the essential gaps. Ask the user to confirm or to change the batch.
This first agreement is on the gaps. Do not edit yet.

Some gaps need a decision of the owner. Ask the question with the options and the cost of each one.

- **An API that uses only API keys.** The Authorize Score checks expect OAuth metadata. OAuth matters when an agent acts for a user who has an account. If the API serves only its own key holders, the owner can accept the OAuth gaps. Then close `authorize.self-serve-credentials` with a key path for agents. Read [self-serve-access.md](self-serve-access.md) and [oauth-for-agents.md](oauth-for-agents.md) to describe the options.
- **A CAPTCHA on a human page.** Keep it (rule 4 of `SKILL.md`). Propose a separate path for agents.
- **Bot policy.** Do not change a block on training crawlers unless the user asks (rule 5 of `SKILL.md`).

Some gaps are not in the code. Examples: a WAF rule, a CDN setting, a DNS record. For these gaps, give the user the exact steps. Do not count them as done until a scan confirms them.

## 7. Plan and implement

For each gap in the batch:

1. Read the playbook of the gap. Check its `Reviewed` date (rule 6 of `SKILL.md`).
2. Read [stacks.md](stacks.md) to find where the change goes in this project.
3. List the exact files that you will add or change, for all the gaps of the batch.
4. Show that list to the user. Edit only after this second agreement.
5. Follow the conventions of the project. Implement one capability at a time. Do not mix two capabilities in one change.
6. Obey the security notes of the playbook.

Tests:

- If the project has tests, add a test for each new behavior. Use the test runner of the project.
- If the project has no tests, ask the user. Propose the built-in runner of the stack, for example `node --test`, with no new dependency.
- If the user does not want tests, verify each change with `curl` and with the scanner, and say so in the report.

## 8. Verify

1. Restart the app if the change needs it.
2. Run the scanner again with the same profile.
3. Compare each check of the batch with the baseline.
4. A Score gap is closed when its check passes. If the check fails, read its `evidence` in the JSON, correct the change, and scan again.
5. A Review gap is closed when the rubric gives `pass`, with evidence.
6. Run the journey again for each stage that was not `clear`.

## 9. Repeat

Go back to step 5 with the new report. Stop when all three conditions are true:

1. No blocker remains.
2. No essential or recommended check fails, in Score or in Review. The owner can accept a gap. Record the reason.
3. The journey for the main task has no `blocked` stage.

Optional gaps and Watch items do not keep the loop open. List them as next steps.

## 10. Report

Give the user one final report:

- **Score:** before and after, with the grade, the coverage, and the pillar points.
- **Review checks:** the result of each one, before and after, with the evidence.
- **Journey:** each stage, before and after.
- **Changes:** each file that you changed, and the gap that it closes.
- **Accepted gaps:** each one, with the reason of the owner.
- **Not verified on production:** each change that depends on a CDN, a WAF, or a DNS record.
- **Next steps:** the optional gaps, and the Watch items that are worth adopting.

Use the report template in `<skill-dir>/assets/report.md`.
