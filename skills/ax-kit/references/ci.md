# ci: a pipeline gate on the AX Score

This command adds a job to the pipeline of the project. The job fails when the AX Score goes below a minimum.
It also adds a badge to the `README`. The command edits files, so confirm the changes first.

## 1. Decide four things

| Decision | Recommendation |
|---|---|
| The target URL | The preview deployment of the pull request. If the platform gives no preview URL, start the app in the job and scan `localhost`. |
| The profile | One of `content`, `api`, `webapp`, `commerce`. The gate needs `--profile`, because a detected profile can change. |
| The minimum score | The score of today. Run the scanner one time to get it. Increase the minimum after each improvement. |
| The scanner source | The copy in the repository when the skill is installed in the project. If not, a clone of the skill repository at a pinned tag. |

Find the skill in the project with `ls .agents/skills/ax-kit .claude/skills/ax-kit 2>/dev/null`.
A pinned tag keeps the gate stable. A new scanner version can add checks and change a score.

## 2. Add the job

Start from `<skill-dir>/assets/ax-gate.yml`, a GitHub Actions workflow. Replace each placeholder.
For another CI system, keep the same three steps: get the scanner, get a URL, and scan.

```bash
node <path-to-skill>/scripts/ax.mjs scan <url> --profile <profile> --min-score <minimum>
```

## 3. Handle the exit codes

| Exit code | Meaning | In the pipeline |
|---|---|---|
| 0 | The score is at or above the minimum. | Pass. |
| 1 | The score cannot reach the minimum. | Fail. |
| 3 | Inconclusive. A check had no result, for example because of a timeout, and the minimum is between the score and the upper bound. | Run the scan one more time. Fail if the result is the same. |
| 4 | No score. The scanner could not reach the target. | Fail. Check the URL and the start of the app. |
| 2 or 5 | A usage error or an internal error. | Fail. Read the error text. |

The template runs the scan a second time on exit code 3.

## 4. Scan production on a schedule

A CDN or a WAF can block agents on production while the preview is open. A scan of `localhost` cannot see that.
Add a scheduled job that scans the production URL one time each week. The template has this job.

## 5. Add the badge

Add a static badge to the `README`. Update it when the score changes.

```markdown
![AX Score](https://img.shields.io/badge/AX_Score-82_B-brightgreen)
```

| Grade | Color |
|---|---|
| A | `brightgreen` |
| B | `green` |
| C | `yellow` |
| D | `orange` |
| F | `red` |

The badge shows the scanner score only. Do not add the Review results to the number.

## 6. Verify

1. Run the scan command locally with the minimum that you chose. The exit code must be 0.
2. Run it with a minimum of 100. The exit code must be 1, unless the site has a perfect score.
3. Push the workflow and confirm that the job runs on a pull request.

## Rules

- Do not lower the minimum to make a failing build pass. Fix the regression, or record why the owner accepts it.
- Keep the scan read-only. The job must not send credentials to the scanner.
- The scanner sends a maximum of 80 requests. Do not run it in a loop against a production site.
