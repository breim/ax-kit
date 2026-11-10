# How the AX Score works

The AX Score is a number from 0 to 100. It measures how well an agent with no human can use one surface of a product.
All the numbers of the model are in [checks.md](checks.md), which is generated from the scanner code. This file explains the rules.

## What the score counts

Each check is in one of three buckets.

| Bucket | Checks | In the score |
|---|---|---|
| Score | The scanner can measure the check, and its standard is stable. | Yes |
| Review | The check needs judgment. Example: an agent can get an API key with no CAPTCHA. | No |
| Watch | The standard is emerging or legacy, or the check is an observation. | No |

This rule gives the score one meaning. The same responses always give the same score.
A site cannot increase its score because the scanner assessed less of it.
An emerging standard does not decrease the score of a site that does not use it.

The Review checks hold many of the problems that matter most when no human is present. Read the score together with them.

## From checks to points

1. **A check gives credit.** Pass gives 1, partial gives 0.5, and fail gives 0. A missing feature is a fail.
2. **A group takes its best member.** Some needs have more than one valid solution. Example: an API description can be in an API catalog, behind a `service-desc` link, or at a conventional path. The group gets the credit of the best one.
3. **A tier gives weight in a pillar.** The tiers are essential, recommended, and optional. An essential check weighs more than an optional check.
4. **A pillar has points for each profile.** The points of all the pillars add up to 100. A pillar that does not apply to a profile has 0 points.
5. **The pillar score** is its points, multiplied by the weighted share of credit that its checks earned.
6. **The AX Score** is the sum of the pillar scores, rounded down.

A check that does not apply to the profile is not in the calculation. It is not a pass.

## Lower bound, upper bound, and coverage

A timeout or a server error leaves a check with no result. The scanner does not guess.

- `score` counts that check as 0. It is a verified lower bound.
- `upperBound` counts that check as 1.
- `coverage` is 100 minus the distance between the two bounds.

When `score` and `upperBound` are in different grade bands, the scanner withholds the grade. Scan again to get a full result.

## Gates

Two failures make the other results meaningless for an agent. Each one limits the score to a cap.

| Gate | Fails when |
|---|---|
| `reach.plain-fetch` | A plain request gets a bot challenge, or a block page with an HTML body. |
| `read.content-without-js` | The page has almost no text in the HTML and shows the signals of a JavaScript application shell. |

These two conditions are not gates:

- A block on AI training crawlers. That is a valid decision of the owner.
- A 403 response to a branded bot user-agent. A site can correctly reject a request that claims a bot name from the wrong address.

A site with a failed gate always gets the lowest grade.

## Grades

The grade bands are in [checks.md](checks.md). Grade A needs a score of 90 or more.

## The gate for a pipeline

`--min-score N` turns the score into an exit code.

- The gate passes when `score` is N or more.
- The gate fails when `upperBound` is below N.
- The gate is inconclusive when N is between the two. A check had no result, so run the scan again.

The gate needs `--profile`. A detected profile can change between two scans, and a different profile has different points.

## Why the model looks like this

- **Pillars before checks.** A new check changes the balance in its pillar only. It does not change the weight of the pillar.
- **No bonus points.** A draft standard that changes its name must not move the score.
- **No skipped checks.** If a missing prerequisite removed its dependent checks, a site with no API description would score above a site with a poor one.
- **Few gates.** A cap is a strong statement. It needs strong evidence.
