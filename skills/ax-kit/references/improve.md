# improve: the improvement loop

This command makes a product better for agents. It finds the gaps, ranks them, implements the fixes, and verifies each fix.
The loop does not chase the score. A gap that needs judgment has the same rank as a gap that the scanner measures.

## 1. Find the target and the profile

1. If the user gave a URL, use it.
2. If the user gave no URL, find how the project runs locally. Read `package.json`, the `README`, and the framework config.
3. Ask the user to confirm the start command, or to give a preview URL.
4. Prefer a local or a preview target. You can verify each change there before it goes to production.
5. Choose the profile: `content`, `api`, `webapp`, or `commerce`. If the product has more than one surface, list the surfaces and run the loop for each one.

A CDN or a WAF changes the Reach results. If the loop runs on a local target, also scan the production URL one time.

## 2. Take the baseline

```bash
node <skill-dir>/scripts/ax.mjs scan <url> --profile <profile> --json
```

- Keep the JSON report. You compare the final report with it.
- If the exit code is 4, the scanner could not reach the target. Stop and tell the user.
- If `cap` is set, a gate failed. That gate is the first item of the worklist.

## 3. Assess the Review checks

The scanner cannot measure these checks. You assess them with evidence.

1. Get the rubrics: `node <skill-dir>/scripts/ax.mjs catalog --json`. Use the checks with `"bucket": "review"` that are in the `review` list of the report.
2. For each check, find evidence in the code or on the site. Give a file path and a line, or a URL.
3. Give one result: `pass`, `partial`, `fail`, or `unknown`. Use the rubric of the check.
4. If you find no evidence, the result is `unknown`. Do not guess. Ask the user one question for each `unknown` result that is essential.

## 4. Run the journey

Attempt the main task of the product as an agent that knows nothing about it.
The protocol is in [audit.md](audit.md), in the section "The cold-start journey".
Record each stage as `clear`, `friction`, or `blocked`.

## 5. Build the worklist

Put all the gaps in one list. A gap is a failed or partial Score check, a failed or partial Review check, or a journey stage that is not clear.

Rank the list in this order:

1. **Blockers:** a failed gate, or a journey stage that is `blocked`.
2. **Essential** checks.
3. **Recommended** checks.
4. **Optional** checks.

In one rank, put the gap with more points first. The points are in `opportunities`. A Review check has no points, so put it after the Score checks of the same rank.

Show the worklist to the user as a table:

| # | Gap | Source | Rank | Points | Playbook | Effort |
|---|---|---|---|---|---|---|
| 1 | `read.content-without-js` | score (gate) | blocker | 11.25 | `server-rendering` | large |
| 2 | `authorize.self-serve-credentials` | review | essential | n/a | `self-serve-access` | medium |

Effort is your estimate: small (one file), medium (some files), or large (a design change).

## 6. Agree on a batch

Propose the first batch: all the blockers and the essential gaps. Ask the user to confirm or to change the batch.
Do not edit before the user agrees.

Some gaps are not in the code. Examples: a WAF rule, a CDN setting, a DNS record. For these gaps, give the user the exact steps. Do not count them as done until a scan confirms them.

## 7. Implement

For each gap in the batch:

1. Read the playbook of the gap. Check its `Reviewed` date (rule 6 of `SKILL.md`).
2. Read [stacks.md](stacks.md) to find where the change goes in this project.
3. Follow the conventions of the project. If the project has tests, add a test for the new behavior.
4. Make the change. Obey the security notes of the playbook.

Implement one capability at a time. Do not mix two capabilities in one change.

## 8. Verify

1. Restart the app if the change needs it.
2. Run the scanner again with the same profile.
3. Compare each check of the batch with the baseline.
4. A Score gap is closed when its check passes. If the check fails, read its `evidence` in the JSON, correct the change, and scan again.
5. A Review gap is closed when the rubric gives `pass`, with evidence.
6. Run the journey again for each stage that was not clear.

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
