# API design for agents

- **Reviewed:** 2026-11
- **Pillar:** Act
- **Checks (all Review):** `act.safe-retries`, `act.pagination`, `act.cli-or-sdk`
- **Template:** none

## Why agents need it

An agent calls an API in a loop, with no human who looks at each result. Three properties decide if that loop is safe:

- The agent can retry a write after a timeout, and the retry creates no duplicate.
- The agent can get all the items of a list, with no gap and no duplicate.
- The agent can see that an operation or a version goes away, before its calls fail.

A CLI or an SDK gives the agent the same operations with less work than raw HTTP requests.

## Status of the standard

- `Idempotency-Key` is an IETF Internet-Draft, not an RFC: `draft-ietf-httpapi-idempotency-key-header-08`, 22 October 2026. Its intended status is Standards Track.
- The `Deprecation` header is RFC 9745 (Standards Track, March 2025). The `Sunset` header is RFC 8594 (Informational, May 2019).
- RFC 9110 defines the status `202 Accepted` and the idempotent methods. `PUT`, `DELETE`, and the safe methods are idempotent. `POST` and `PATCH` are not.
- The `next` link relation in a `Link` header is RFC 8288. Cursor pagination and API versioning have no standard.

## Implement

### 1. Paginate each list with a cursor

- Give each list operation a `limit` parameter with a documented default and a documented maximum.
- Return an opaque cursor for the next page. Return `null` when no more items exist.
- Sort by a key that does not change, for example the creation time and then the ID. Document the order.
- Do not use page numbers or offsets for a list that changes. A new item moves the pages, and the agent gets a gap or a duplicate.

```http
GET /v1/invoices?limit=50&cursor=eyJpZCI6Imludl84ZjNrMiJ9
```

```json
{
  "data": [{ "id": "inv_8f3k3" }],
  "next_cursor": "eyJpZCI6Imludl84ZjNrMyJ9"
}
```

You can also give the next page in a header: `Link: <https://api.acme.example/v1/invoices?cursor=...>; rel="next"`.

### 2. Make each write safe to retry

Accept the `Idempotency-Key` request header on each `POST` and `PATCH` operation that creates or changes a resource.
The value is a Structured Field string, thus it has double quotes. A UUID is a good key.

```http
POST /v1/invoices HTTP/1.1
Content-Type: application/json
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

The draft gives this server behaviour:

| Case | Response |
|---|---|
| The first request with a key | Process the request and return its result |
| The same key and the same payload, after the first request completed | The result of the first request |
| The same key and a different payload | `422 Unprocessable Content` |
| The same key while the first request is still in work | `409 Conflict` |
| No key on an operation that requires one | `400 Bad Request` |

- Store the key before you do the work, in the same transaction as the write if that is possible.
- Document how long the server keeps a key. The draft requires a published idempotency specification.
- Declare the header as a parameter of the operation in the OpenAPI file.

```json
{ "name": "Idempotency-Key", "in": "header", "required": true,
  "schema": { "type": "string" },
  "description": "A unique key for this request. The server keeps a key for 24 hours.",
  "example": "\"8e03978e-40d5-43e8-bc93-6894a57f9324\"" }
```

Where it fits the resource, use `PUT` with an ID from the client. Such a request is idempotent with no key.

### 3. Return a status resource for long work

If an operation takes more than some seconds, do not hold the connection open.

1. Answer `202 Accepted`. The body gives the current status and the URL of a status resource.
2. The agent sends `GET` requests to the status URL until the status is final.
3. The final status gives the result, or a link to the result, or a structured error.

```json
{ "id": "job_41c9", "status": "pending", "status_url": "https://api.acme.example/v1/jobs/job_41c9" }
```

Use a small fixed set of status values, for example `pending`, `running`, `succeeded`, and `failed`. Document the set.

### 4. Version the API and announce each removal

- Use one version scheme, for example a path prefix such as `/v1`. Document it.
- Add fields and operations without a new version. Make a new version for each change that breaks a client.
- When you deprecate an operation, send the `Deprecation` header on its responses. The value is a Structured Field date.
- When you know the removal date, also send the `Sunset` header. The value is an HTTP date.
- The `Sunset` time must not be earlier than the `Deprecation` time.
- Link to the migration guide with the `deprecation` link relation.

```http
Deprecation: @1782864000
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
Link: <https://acme.example/docs/api/v1-removal>; rel="deprecation"; type="text/html"
```

In this example, `@1782864000` is 1 July 2026 at 00:00:00 UTC. Mark the operation with `deprecated: true` in the OpenAPI file also.

### 5. Give agents a CLI or an SDK

An agent in a terminal can run one command. A CLI is a good agent interface when it has these properties:

- **No prompt.** Each input has a flag or an environment variable. A flag such as `--yes` confirms a destructive action.
- **JSON output.** A flag such as `--json` writes only JSON to standard output. Messages and progress go to standard error.
- **Exit codes.** Zero means success. Each other value means a failure, and the documentation lists the values.
- **Login with no browser.** The CLI accepts an API key from an environment variable.
- **Help text.** `--help` on each command lists the flags and gives one example.

An SDK is the alternative for an agent that writes code. Generate it from the OpenAPI file, and publish it in the package registry of the language.

## Stack notes

- **SQL database:** use keyset pagination. Filter on the sort key of the last item, and select `limit + 1` rows to know if a next page exists.
- **Idempotency store:** a table with a unique constraint on the caller and the key. Store a hash of the payload and the response.
- **Job queue:** store each job with its status in the database. The status resource reads that row.
- **API gateway:** make sure that the gateway passes the `Idempotency-Key`, `Deprecation`, `Sunset`, and `Link` headers.

For other stacks, read [stacks.md](stacks.md).

## Verify

These checks are Review checks. The scanner does not measure them. Collect the evidence, and compare it with the rubric in [checks.md](checks.md).

```bash
curl -s 'https://<host>/v1/<list>?limit=1'
curl -i -X POST https://<host>/v1/<resource> -H 'Idempotency-Key: "<uuid>"' -H 'Content-Type: application/json' -d '<body>'
<cli> --help
<cli> <command> --json
```

Send a `POST` request only to a sandbox or with the approval of the owner.

- `act.pagination` passes when each list operation has a cursor, a documented limit, and a stable order.
- `act.safe-retries` passes when two `POST` requests with one key create one resource, and the documentation gives the retention time of a key.
- `act.cli-or-sdk` passes when an official CLI runs with no prompt and writes JSON, or an official SDK exists.

## Security notes

- Bind each idempotency key to the authenticated caller. A key of one account must not return the stored response of a different account.
- Make the cursor opaque, and validate it on the server. Do not put a filter or a permission in a cursor that the client can change.
- Enforce the maximum `limit` on the server.
- Apply the authorization of the original request to the status resource of a job.
- A CLI must read the secret from an environment variable or a file, not from an argument. Other processes can read arguments.

## Common mistakes

- **Offset pagination on a list that changes.** The agent gets an item two times, or it does not get an item.
- **No maximum limit.** One request for all the rows makes the response too large for the context of the agent.
- **An idempotency key that the server stores after the work.** Two parallel retries then run the work two times.
- **A replay with a different payload that returns `200`.** The agent thinks that the second request had an effect.
- **A `202` response with no status URL.** The agent cannot know when the work is complete.
- **A removal with no `Deprecation` or `Sunset` header.** The first signal that the agent gets is a `404`.
- **A CLI that opens a browser to log in.** An agent with no browser stops there.
