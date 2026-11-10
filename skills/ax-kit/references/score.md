# score: the AX Score of a URL

This command runs the scanner and shows the result. It does not edit files, and it does not assess the Review checks.

## Procedure

1. Get the URL from the user. For a local app, use the local URL, for example `http://localhost:3000`.
2. Choose the profile. If you are not sure, omit `--profile`. The scanner detects it and reports the signals that it used.
3. Run the scanner:

   ```bash
   node <skill-dir>/scripts/ax.mjs scan <url> --profile <profile> --json
   ```

4. Read the exit code.

   | Exit code | Meaning | What to do |
   |---|---|---|
   | 0 | The scanner gave a score. | Show the result. |
   | 4 | The scanner could not reach the entry URL. | Tell the user. Check the URL and the network. |
   | 5 | The scanner had an internal error. | Show the error text to the user. |

5. Show the result in this order:
   - The score, the grade, and the coverage. If `grade` is `null`, say that the grade is withheld and give `score` and `upperBound`.
   - The cap, if `cap` is set. Name the gate that failed. This is the most important line of the result.
   - The pillar points, in the order of the report.
   - The top gaps from `opportunities`, with the points and the playbook of each one.
   - The number of Review checks. Say that the scanner cannot measure them and that `audit` assesses them.
   - The Watch items that the site adopted, and each legacy path that the scanner found.
   - Each check in `coverage.notAssessed`, with its `reason`.

6. Suggest the next command. Use `improve` to fix the gaps in a project. Use `audit` for a full report on a site.

## What the score means

- The score counts only measured checks on stable standards. Two scans of the same responses give the same score.
- The score is a lower bound. A check that the scanner could not assess counts as 0 in `score` and as 1 in `upperBound`.
- A check that does not apply to the profile is not in the score.
- An emerging standard does not decrease the score of a site that does not use it.
- A site with a failed gate cannot score above 59.

Do not present the score as a complete measure of AX. The Review checks hold the problems that matter most when no human is present.
