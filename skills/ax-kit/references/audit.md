# audit: a full diagnosis of a URL

This command gives a complete picture of the Agent Experience of a site. It has three parts: the scanner, the Review checks, and a cold-start journey.
It does not edit files. It does not change data on the site.

## 1. Agree on the scope

1. Get the URL. If the product has more than one surface, list them: the marketing site, the documentation, the API, the app.
2. Choose a profile for each surface: `content`, `api`, `webapp`, or `commerce`.
3. Tell the user what the audit does: a maximum of 80 read-only requests for each surface from the scanner, and a maximum of 15 from the journey.
4. If the user is not the owner of the site, keep to public pages and do not test credentials.

## 2. Run the scanner

```bash
node <skill-dir>/scripts/ax.mjs scan <url> --profile <profile> --json
```

Keep the JSON report. If the exit code is 4, the target gave no usable response. Report that and stop.

## 3. Assess the Review checks

The scanner cannot measure the checks in the `review` list of the report. Assess each one with evidence.

1. Get the rubrics: `node <skill-dir>/scripts/ax.mjs catalog --json`. Use the checks with `"bucket": "review"`.
2. Look for public evidence: the documentation, the signup page, the pricing page, the OpenAPI file, the error responses.
3. Look only. Do not submit a form, and do not create an account.
4. Give each check one result from its rubric: `pass`, `partial`, `fail`, or `unknown`.
5. Give the evidence: a URL and a short quote, or the request and the response.

If the user gave access to the codebase, read the code too. Evidence from code is stronger than evidence from documentation.

## 4. The cold-start journey

The scanner checks standards. The journey checks reality: can an agent complete a task with only what the site gives it?

### Choose the task

Choose the main task of the product and write it in one sentence. Ask the user if it is not clear.

- A content site: "Find the price of the Pro plan."
- An API: "Find how to authenticate and how to list invoices."
- A store: "Find the price and the stock of one product."

### Rules of the journey

- **Start from the domain only.** Do not use what you know about the product from memory. Use only what the site returns.
- **Use plain HTTP requests.** Do not use a browser, and do not run JavaScript. Most agents fetch text.
- **Stay read-only.** Stop before an action that changes state: a signup, a form, a purchase, a write to the API.
- **Stop at 15 requests.**
- **Record each request:** the URL, the status, the size, and why you made it.

### The stages

Do the stages in order. Give each stage one result.

| Stage | What you try | Clear when |
|---|---|---|
| Reach | Request the domain. | You get the content with no challenge. |
| Discover | Find the resource for the task. Try `llms.txt`, the `Link` headers, the sitemap, and the API catalog before you guess a URL. | A pointer from the site leads you to the resource in 3 requests or fewer. |
| Read | Read the resource. | The answer is in the response, in text, with no JavaScript. |
| Authorize | Find how an agent gets credentials. Read, do not sign up. | The documentation shows a path with no human step. |
| Act | Find the exact request for the task. For a public read operation, send one `GET`. | The API description or the documentation gives the full request. |
| Recover | Request one wrong path, or send one invalid parameter to a read operation. | The error says what is wrong and how to correct it. |

A stage that does not apply gets the result `n/a`. Example: a content site has no Authorize stage.

### The results

| Result | Meaning |
|---|---|
| `clear` | The first attempt worked, with a pointer that the site gave. |
| `friction` | The task worked, but with a guess, more than 3 requests, a large payload with little content, or a step made for humans. |
| `blocked` | An agent with no human and no JavaScript cannot continue. |

### The journey log

| # | Stage | Request | Status | Size | Result | Note |
|---|---|---|---|---|---|---|
| 1 | Reach | `GET /` | 200 | 48 kB | clear | The page has the text in the HTML. |
| 2 | Discover | `GET /llms.txt` | 404 | 1 kB | friction | No index. The next step is a guess. |

## 5. Compare with an external scanner (optional)

A hosted scanner can show a defect in this audit, or a different view.
Ask the user before you send the URL to an external service. If the user agrees, compare the checks that both tools have.
When the results differ, read the specification of that standard and say which result is correct.

## 6. Write the report

Use the template in `<skill-dir>/assets/report.md`. Put the report in the conversation. Write a file only if the user asks for one.

Order of the report:

1. **Summary:** the score, the grade, the coverage, and the cap if one applies. Then one sentence on the largest problem.
2. **Blockers:** each failed gate and each `blocked` stage of the journey.
3. **Findings:** each gap, in the rank order of [improve.md](improve.md): essential, recommended, optional. Give the evidence and the playbook.
4. **Review checks:** each result, with its evidence.
5. **Journey:** the task, the log, and the result of each stage.
6. **Watch:** the emerging standards that the site adopted, the ones that it can adopt next, and each legacy path.
7. **Not assessed:** each check with no result, with the reason.
8. **Next steps:** `improve` to fix the gaps in the project, or `add <capability>` for one gap.

## Rules for the report

- Give the evidence for each finding. A finding with no evidence is an opinion.
- Do not turn the Review results or the journey into points. The score is the scanner score.
- Say what the audit did not cover: pages other than the entry page, flows behind a login, and behavior under load.
