# Errors and limits

- **Reviewed:** 2026-11
- **Pillar:** Recover
- **Checks:** `recover.honest-404`, `recover.structured-errors`, `recover.cache-validators`, `recover.rate-limits` (Review), `recover.actionable-errors` (Review), `recover.deprecation-headers` (Watch)
- **Template:** `assets/problem.json`

## Why agents need it

A human reads an error page and decides what to do. An agent has only the status code, the headers, and the body.
If the status is wrong, the agent reads an error page as content. If the body is HTML, the agent cannot find the cause.
A correct status, a structured body, and a retry time let the agent correct the request with no human.

## Status of the standard

- The status codes and the `Retry-After` header are RFC 9110, stable. Status 429 is RFC 6585, stable.
- Problem Details for HTTP APIs is RFC 9457, stable. It replaced RFC 7807.
- The `Deprecation` header is RFC 9745. The `Sunset` header is RFC 8594. The two are stable.
- The `RateLimit` and `RateLimit-Policy` headers are an IETF draft, `draft-ietf-httpapi-ratelimit-headers-11`. The syntax changed between versions of the draft.
- The `X-RateLimit-*` headers are a convention. They have no specification, and their meaning is different between APIs.

## Implement

### 1. Return the correct status code

| Case | Status |
|---|---|
| The path or the resource does not exist | 404, or 410 when the resource is permanently gone |
| The request has no credentials, or the credentials are not valid | 401 with a `WWW-Authenticate` header |
| The credentials are valid, but they give no permission | 403 |
| The request conflicts with the current state of the resource | 409 |
| The syntax is correct, but a value is not valid | 422 |
| The client sent too many requests | 429 with a `Retry-After` header |

- Do not return status 200 with an error in the body.
- Do not redirect a missing path to the home page. The scanner follows the redirect and reads the final status.

### 2. Return problem details for each API error

Start from `assets/problem.json`.

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://acme.example/problems/invalid-currency",
  "title": "The currency is not valid.",
  "status": 422,
  "detail": "The value \"EURO\" is not a currency code. Use an ISO 4217 code, for example \"EUR\" or \"USD\".",
  "instance": "/requests/req_8f31c2",
  "errors": [
    { "pointer": "#/currency", "detail": "must be one of: EUR, USD, GBP" }
  ]
}
```

RFC 9457 requires no member. Send these members in each error:

- `type`: a URI that identifies the problem type. Use one stable URI for each type. The default is `about:blank`.
- `title`: a short summary of the problem type. It is the same for each occurrence.
- `status`: a number. It must be the same as the status code of the response.
- `detail`: an explanation of this occurrence. It helps the client correct the request.
- `instance`: a URI that identifies this occurrence. It is optional.

A problem type can add its own members, for example `errors` with a JSON Pointer to each field.
Return this format for each error. This includes an unknown route and an error from the framework or the gateway.

### 3. Make each error actionable

An error must answer four questions: what failed, why it failed, which values are valid, and how to correct the request.

| Weak | Actionable |
|---|---|
| `"detail": "Bad Request"` | `"detail": "The field limit is 500. The maximum is 100. Send a value from 1 to 100."` |
| `"detail": "Not found"` | `"detail": "No invoice has the ID inv_42. Use GET /invoices to list the IDs."` |

- Name the field that failed. Use a JSON Pointer in an extension member.
- Give the valid values or the valid range.
- Put the data for machines in `type` and in extension members. A client must not parse the `detail` text.
- Say if the same request can succeed later.

### 4. Tell the agent its limits

A 429 response must tell the agent when to try again:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

`Retry-After` is a number of seconds or an HTTP date. Send the limit headers of the draft in each response:

```http
RateLimit-Policy: "default";q=100;w=60
RateLimit: "default";r=37;t=42
```

- `q` is the quota, and `w` is the window in seconds.
- `r` is the quota that remains. `t` is the number of seconds in which the client can use no more than `r`.
- The quota is not always full again after `t` seconds.
- If a response has `Retry-After` and `RateLimit`, the client obeys `Retry-After`.
- If the API has `X-RateLimit-*` headers, keep them. Document if the reset value is a number of seconds or a timestamp.

### 5. Announce a deprecation

```http
Deprecation: @1767225600
Sunset: Wed, 30 Jun 2027 23:59:59 GMT
Link: <https://acme.example/docs/migrate-to-v2>; rel="deprecation"; type="text/html"
```

- `Deprecation` is the character `@` and the Unix time of the deprecation.
- `Sunset` is the HTTP date when the resource stops. It must not be earlier than the deprecation date.
- The `Link` header points to the migration guide.

### 6. Make the 404 response small and useful

- **A page:** return status 404 with a small page. Link to the home page, the sitemap, and `llms.txt`.
- **An API:** return a 404 problem with a `detail` that points to the API description.
- Do not send the full navigation and all the scripts of the site in a 404 page.

### 7. Send a cache validator

Send an `ETag` header or a `Last-Modified` header with each page. Answer a matching `If-None-Match` or `If-Modified-Since` request with status 304.

## Stack notes

- **Hono, Elysia, and Express:** put the problem format in the one error handler of the app and in the not-found handler.
- **FastAPI:** add exception handlers for `HTTPException` and `RequestValidationError` that return `application/problem+json`.
- **Next.js:** `app/not-found.tsx` returns status 404 for a missing route. A route handler returns a problem with `Response.json()` and a `Content-Type` header.
- **Static host:** set the 404 page in the host config. A single-page fallback that returns status 200 for each path is a soft 404.
- **Gateway or CDN:** the default error pages of a gateway are HTML. Set a JSON error response for the API paths.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<host>/a-path-that-does-not-exist
curl -i -H 'Accept: application/json' https://<api-host>/<base-path>/a-path-that-does-not-exist
curl -sI https://<host>/ | grep -i -E '^(etag|last-modified)'
```

- `recover.honest-404` passes when a missing path returns status 404 or 410. A different 4xx status gives a partial result.
- `recover.structured-errors` passes when the error is `application/problem+json` with a string `type`, `title`, or `detail`, and a correct `status`.
- `recover.structured-errors` gives a partial result for a different JSON object with a `message`, `error`, or `code` member.
- `recover.cache-validators` passes when the entry response has an `ETag` or a `Last-Modified` header.
- `recover.deprecation-headers` is an observation. It has no verdict.
- For `recover.rate-limits` and `recover.actionable-errors`, collect the evidence that [checks.md](checks.md) lists.

## Security notes

- An error must not show a stack trace, a database query, a file path, or an internal host name.
- An error must not show data of a different tenant. Return the same 404 for a resource of a different tenant and for a missing resource.
- Return the same error for an unknown user and for a wrong password.
- Do not remove an authentication check to make a missing path return 404. A 401 response for each path is a valid design.
- Do not copy the input of the client into `detail` without encoding.
- The limit headers show the capacity of the service. Send detailed quotas only to authenticated clients.
- Write the full cause to the server log, and put only an identifier in `instance`.

## Common mistakes

- **Status 200 with `{"error": ...}` in the body.** The agent reads the response as a success.
- **A single-page fallback.** The host returns the app shell with status 200 for each unknown path.
- **A problem body with `Content-Type: application/json`.** A client then does not know that the body follows RFC 9457.
- **A `status` member that is different from the status code.** RFC 9457 says that the two must agree.
- **A 429 response with no `Retry-After` header.** The agent then tries again too early, or it stops.
- **JSON errors from the app, and HTML errors from the gateway.** An unknown route or a timeout then returns a page that the agent cannot parse.
- **A different error format for each endpoint.** Use one error handler for the API.
