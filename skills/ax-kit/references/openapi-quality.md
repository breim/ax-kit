# OpenAPI quality

- **Reviewed:** 2026-11
- **Pillar:** Act
- **Checks:** `act.openapi-valid`, `act.openapi-operations`, `act.openapi-responses`, `act.openapi-security`, `act.openapi-examples`
- **Template:** none

## Why agents need it

An agent has no developer to ask what an endpoint does. It reads the OpenAPI file and builds each request from that file.
If an operation has no name, no description, or no schema, the agent guesses. A wrong guess is a failed call or a wrong action.

The goal is a file that an agent can use with no other documentation.

## Status of the standard

- OpenAPI is a stable standard of the OpenAPI Initiative. Version 3.2.0 has the date 19 September 2025. Versions 3.0 and 3.1 are in wide use.
- Swagger 2.0 is the predecessor of OpenAPI 3. It has no `components`, no `requestBody`, and no `servers`.
- The scanner reads a JSON file fully. For a YAML file, it reads only block-style YAML. Read step 8.

## Implement

### 1. Generate the file from the code

Generate the file from the route definitions and the schemas of the project, in the build.
A file that a person edits by hand goes out of date. Then the agent calls operations that do not exist.

### 2. Give each operation a stable name and a purpose

- `operationId` is the name that the agent uses for the operation. It must be unique in the file.
- Set each `operationId` in the code. A generated name can change when a function or a path moves.
- `summary` says what the operation does, in one line.
- `description` says when to use the operation, and names the alternative for the other cases.

```json
"/invoices/{id}": {
  "get": {
    "operationId": "getInvoice",
    "summary": "Get one invoice",
    "description": "Use this operation when you have the ID of the invoice. To find invoices of a customer, use listInvoices."
  }
}
```

### 3. Describe the success response and the error responses

- Give each `2xx` response a schema. A `204` response needs no schema.
- An empty schema (`{}`) tells the agent nothing. The scanner does not count it.
- Add one `4xx` response or a `default` response to each operation, with the schema of the error body.

```json
"responses": {
  "200": {
    "description": "The invoice",
    "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Invoice" } } }
  },
  "404": { "$ref": "#/components/responses/NotFound" },
  "default": { "$ref": "#/components/responses/Problem" }
}
```

For the format of the error body, read [errors-and-limits.md](errors-and-limits.md).

### 4. Type the schemas

- Give each property a `type` and a `description`.
- Add the constraints that the server applies: `enum`, `format`, `minimum`, `maximum`, `pattern`, `maxLength`, and `required`.
- Give the unit of a number in its description, for example "the amount in cents".
- Do not use a free-form object where the server accepts a fixed set of properties.

### 5. Add examples

An example shows a correct request faster than a schema. Add an `example` to the parameters, the request bodies, and the responses.

```json
"Invoice": {
  "type": "object",
  "required": ["id", "amount", "currency"],
  "properties": {
    "id": { "type": "string", "description": "The ID of the invoice", "example": "inv_8f3k2" },
    "amount": { "type": "integer", "description": "The amount in cents", "minimum": 0, "example": 12900 },
    "currency": { "type": "string", "description": "The ISO 4217 currency code", "example": "EUR" }
  }
}
```

The scanner finds an example on a parameter, on a media type, and in a schema, also through a local `$ref`.

### 6. Declare the authentication

- Declare each method in `components.securitySchemes`. The types are `apiKey`, `http`, `mutualTLS`, `oauth2`, and `openIdConnect`.
- Apply the schemes with a top-level `security` requirement. Change the requirement on an operation only when that operation is different.
- If an operation is public, set `"security": []` on that operation.
- If all the API is public, set the top-level requirement to `"security": [{}]`. OpenAPI defines `{}` as anonymous access.

```json
"components": {
  "securitySchemes": {
    "bearerAuth": { "type": "http", "scheme": "bearer", "description": "An API key from the dashboard" }
  }
},
"security": [{ "bearerAuth": [] }]
```

### 7. Set `info` and `servers`

- OpenAPI requires `info.title`. Add `info.description` with the purpose of the API in two or three sentences.
- `servers` gives the base URL of the production API. Without it, the agent does not know where to send a request.

### 8. Publish JSON

Publish the file as JSON at a stable public URL. For the URL and the catalog, read [api-catalog.md](api-catalog.md).

If the project publishes only YAML, the scanner uses a small outline reader, and not a full YAML parser.
The outline reader stops at anchors, aliases, tags, tabs, and a second document.
It also stops at a flow collection (`{ ... }` or `[ ... ]`) in the structure, for example as the value of `paths`, `responses`, `parameters`, or `schema`.
Then `act.openapi-valid` fails. A JSON version removes the problem.

## Stack notes

- **FastAPI:** the framework serves `/openapi.json`. Set `operation_id` and `summary` on each route, and declare the response model and the error responses.
- **Hono and Elysia:** generate the file from the route schemas. Give each route an explicit operation ID.
- **Spring with springdoc:** the default JSON path is `/v3/api-docs`. Set `operationId` in `@Operation`, and declare the responses with `@ApiResponse`.
- **A YAML source file:** convert it to JSON in the build, and publish the JSON file.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -s https://<host>/openapi.json | head -c 400
node <skill-dir>/scripts/ax.mjs scan https://<host> --profile api --json
```

- `act.openapi-valid` passes when the file is OpenAPI 3 with `info.title` and one operation or more. Swagger 2.0 is a partial result.
- `act.openapi-operations` passes when 90% or more of the operations have an `operationId` and a `summary` or a `description`. From 50% to 89% is a partial result.
- `act.openapi-responses` passes when 90% or more of the operations have a success schema and a `4xx` or `default` response. From 50% to 89% is a partial result.
- `act.openapi-security` passes when a security requirement uses a declared scheme, or when an empty requirement states that the API is public. Declared schemes that no requirement uses are a partial result.
- `act.openapi-examples` passes when 50% or more of the operations have an example. One operation with an example is a partial result.

If the scanner finds no API description, the last four checks have no result. Fix `discover.api-description` first.

## Security notes

- Publish only the public operations. Remove internal, admin, and partner operations from the public file.
- Do not put a real credential, a real customer, or a real email address in an example.
- Do not list staging or internal hosts in `servers`.
- A security scheme describes the method. It must not contain a key or a token.

## Common mistakes

- **An `operationId` that the framework generates from the function name and the path.** It changes when the code moves, and the agent loses the name.
- **A summary that repeats the path.** "GET /invoices/{id}" does not tell the agent when to use the operation.
- **Only a `200` response.** The agent then cannot read the error body, and it retries blind.
- **An empty response schema.** The agent gets a body that it cannot interpret.
- **An example that does not match its schema.** Validate the examples in the build.
- **Security schemes that no requirement uses.** The agent sees the methods, but it does not know which operation needs which one.
- **YAML only.** Many tools read only JSON.
