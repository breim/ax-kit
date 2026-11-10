# design: AX review before the code exists

This command reviews a plan for an API, a site, or a feature. It finds the decisions that are cheap now and expensive after the release.
It does not edit files. The output is an AX design brief.

## Ten principles

Use these principles to judge each decision.

1. **Discoverable from the domain.** An agent that knows only the domain can find each capability.
2. **Text first.** Each page and each response has a form that a machine can read with no browser.
3. **No human in the critical path.** Signup, authentication, and payment have a path with no CAPTCHA, no inbox, and no sales call.
4. **Errors teach.** An error says what failed, why, and how to correct the request.
5. **Safe to retry.** A repeated write has no second effect. Limits are explicit.
6. **Least privilege.** Credentials are scoped and expire. An agent gets only the access that its task needs.
7. **Stable contracts.** The API has versions, and it announces a deprecation in a machine-readable way.
8. **One truth.** Agents and humans get the same content and the same prices.
9. **Small payloads.** Each token that an agent reads has a cost. Send the content, not the page chrome.
10. **Standards before custom formats.** An agent already knows a standard. It must learn a custom format each time.

## Procedure

### 1. Read the plan

Get the specification, the product document, or the description from the user. Find these facts:

- The surfaces: content site, API, web app, store. Each surface has a profile.
- The main tasks that a user gives to an agent. Write 3 to 5 tasks, one sentence each.
- The data that is private, and the actions that have a consequence (a payment, a deletion, a message to a third party).

### 2. Ask the questions of each pillar

Answer each question from the plan. If the plan has no answer, the question becomes a decision for the brief.

**Reach**
- Will a CDN or a WAF stand in front of the product? How will it treat a request with no browser?
- Which AI bots can read the content: training crawlers, search crawlers, user-directed agents?

**Discover**
- How does an agent find the documentation, the API description, and the MCP server from the domain?
- Is the list of pages generated from the routes, or will a person maintain it?

**Read**
- Is the main content in the first HTML response?
- Does each page have a Markdown version?
- Are the prices and the limits in text or in structured data?

**Act**
- Does each main task map to one API operation or one MCP tool?
- Is the OpenAPI file generated from the code?
- Are writes safe to retry? Do long operations return a job that the agent can poll?

**Authorize**
- How does an agent get credentials for a user, with no human step? Which OAuth grants exist?
- Are the scopes small enough that a user can give an agent limited access?
- Is there a sandbox?

**Recover**
- Do all the errors have one structured format?
- How does the API tell an agent its rate limits and when to retry?
- How does the API announce a deprecation?

**Transact**
- Can an agent pay, or start a payment that a user confirms? Which protocol?
- Who authorizes the amount, and what is the limit?

### 3. Write the AX design brief

Give the user one document with these parts:

1. **Surfaces and profiles.**
2. **Main tasks for agents.**
3. **Decisions to make now.** For each one: the question, the options, your recommendation, and the cost of a late change.
4. **Capabilities to build.** For each one: the playbook in `references/`, and the checks that will prove it.
5. **Risks.** Security, privacy, and abuse. Read the security notes of each playbook that you name.
6. **Acceptance.** The check IDs that must pass, the Review rubrics that must give `pass`, and a target score for each surface.

### 4. Offer the next step

- To build one capability now, use `add <capability>`.
- When a first version runs, use `improve`.
- To keep the result, use `ci`.

## Rules

- Recommend a stable standard before an emerging one. Read [standards.md](standards.md) for the status of each standard.
- Do not recommend an emerging standard as a requirement. Present it as an option, with its status and its date.
- Keep the brief short. A decision that the plan already made well needs one line.
