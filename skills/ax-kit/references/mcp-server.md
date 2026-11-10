# Remote MCP server

- **Reviewed:** 2026-11
- **Pillar:** Act
- **Checks:** `act.mcp-endpoint`, `act.mcp-tools` (Review)
- **Template:** none

## Why agents need it

The Model Context Protocol (MCP) gives an agent a list of typed tools that it can call. The user adds one URL to the client.
With no MCP server, each agent must build its own integration from the API documentation, and most agents do not.

## Status of the standard

- This playbook implements revision `2026-07-28`. Its source is <https://modelcontextprotocol.io/specification/2026-07-28>.
- Revision `2026-07-28` is stateless. It has no `initialize` handshake, no `Mcp-Session-Id` header, and no `GET` stream.
- Each server must implement `server/discover`. Each `POST` request must have the headers `MCP-Protocol-Version` and `Mcp-Method`.
- Clients of the previous revision, `2025-11-25`, still exist. Support that revision during the transition. Read step 8.
- The specification deprecates the HTTP+SSE transport of revision `2024-11-05`. Do not start with it.

## Implement

### 1. Design a small set of tools

- Make one tool for each task of the user, not one tool for each API endpoint.
- Keep the number of tools small. A model selects badly from a long list of tools that look the same.
- Write each description for the model. Say what the tool does, when to use it, and when to use a different tool.
- Give each parameter a type and a description. Use `enum` where the set of values does not change.

Keep a tool name between 1 and 128 characters. Use only ASCII letters, digits, `_`, `-`, and `.`.

```json
{
  "name": "create_invoice",
  "title": "Create an invoice",
  "description": "Create a draft invoice for one customer. Use find_customer first if you do not have the customer ID. This tool does not send the invoice.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string", "description": "The ID of the customer, for example cus_8f3k2" },
      "amount": { "type": "integer", "minimum": 1, "description": "The amount in cents" },
      "currency": { "type": "string", "enum": ["EUR", "USD"], "description": "The ISO 4217 currency code" }
    },
    "required": ["customer_id", "amount", "currency"]
  },
  "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false }
}
```

Set the annotations on each tool. The defaults are `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, and `openWorldHint: true`.
A read-only tool with no annotations thus looks destructive to a client.

### 2. Serve one endpoint that accepts POST

The MCP endpoint is one URL path, for example `https://<host>/mcp`. The scanner sends its probe to `/mcp` on the scanned origin.

- The client sends each JSON-RPC request as one `POST` with `Content-Type: application/json`.
- The `Accept` header of the client lists `application/json` and `text/event-stream`.
- The server answers with one JSON object, or with an SSE stream that ends with the JSON-RPC response.
- If the server supports only this revision, answer `GET` and `DELETE` with `405 Method Not Allowed`.
- If the server sends an SSE stream, add the header `X-Accel-Buffering: no`.

### 3. Read the metadata of each request

No state stays between two requests. Each request carries its metadata in `params._meta`, and the HTTP headers repeat a part of it.

| Header | Value | Required for |
|---|---|---|
| `MCP-Protocol-Version` | Same as `_meta["io.modelcontextprotocol/protocolVersion"]` | Each request |
| `Mcp-Method` | Same as `method` | Each request |
| `Mcp-Name` | Same as `params.name` or `params.uri` | `tools/call`, `resources/read`, `prompts/get` |

- If a header is absent or does not match the body, return `400` with the JSON-RPC error `-32020`.
- If the server does not support the protocol version, return `400` with the error `-32022`. Put the supported versions in `error.data.supported`.
- If the server does not implement the method, return `404` with the error `-32601`.

If a tool needs state across calls, return an explicit handle from one tool. Accept that handle as an argument of the next tool.

### 4. Implement `server/discover`

The request is the `curl` command in the Verify section. It has no parameters other than `_meta`. The result:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28", "2025-11-25"],
    "capabilities": { "tools": {} },
    "_meta": { "io.modelcontextprotocol/serverInfo": { "name": "<server name>", "version": "<version>" } },
    "instructions": "<How a model uses this server, in a few sentences>",
    "ttlMs": 3600000,
    "cacheScope": "public"
  }
}
```

The specification requires `resultType`, `supportedVersions`, `capabilities`, `ttlMs`, and `cacheScope`.

### 5. Return results that a model can act on

- Each result has `resultType`. The result of `tools/list` also has `ttlMs` and `cacheScope`.
- Return the tools in the same order in each `tools/list` response. A stable order lets the client cache the list.
- If the input of a tool is wrong, return a result with `isError: true`. The text must say how to correct the call.
- A good error text is "The currency GBP is not available. Use EUR or USD."
- Use a JSON-RPC error only for an unknown tool, a malformed request, or a server fault.

### 6. Validate the Origin header

Validate the `Origin` header of each request. If the header is present and not valid, return `403 Forbidden`.
This prevents a DNS rebinding attack from a web page.

### 7. Add authorization

Authorization is optional in MCP. If the tools read or change private data, the server needs it.

- Answer a request with no valid token with `401` and the header `WWW-Authenticate: Bearer resource_metadata="<metadata URL>"`.
- Publish the OAuth 2.0 Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, with the `authorization_servers` field.
- Accept only tokens that the authorization server issued for this MCP server.

For the full flow, read [oauth-for-agents.md](oauth-for-agents.md).

### 8. Support revision 2025-11-25 during the transition

A server can serve the two revisions on one endpoint:

- A request with the `_meta` fields of step 3 gets the stateless behaviour of this playbook.
- An `initialize` request gets the behaviour of revision `2025-11-25` for that session.

If the server supports only revision `2026-07-28`, name the supported versions in the error for an `initialize` request.

To help clients find the server, publish an MCP Server Card. Read [agent-discovery.md](agent-discovery.md).

## Stack notes

- **SDK:** use an official MCP SDK. Make sure that its release supports revision `2026-07-28`.
- **Next.js:** `app/mcp/route.ts` with a `POST` handler. Export no `GET` handler, and the framework returns `405`.
- **Serverless and edge:** the stateless model fits. Do not keep protocol state in the memory of one instance.
- **Reverse proxy:** turn off response buffering for the MCP path, or the client gets the SSE events late.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<host>/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

The scanner sends this request one time. It is the only `POST` of a scan.

- `act.mcp-endpoint` passes when the response is a JSON-RPC result with `supportedVersions`, as JSON or as an SSE stream.
- `act.mcp-endpoint` also passes when the response is `401` with a `WWW-Authenticate` header.
- A JSON-RPC error is a partial result. Examples are "method not found" from an older server, and the error `-32022`.
- A `404`, a `405`, an HTML page, or a body that is not JSON-RPC is a fail.
- `act.mcp-tools` is a Review check. Call `tools/list` and compare the tools with the rubric in [checks.md](checks.md).

## Security notes

- Validate the input of each tool, apply access control, and limit the call rate. The specification requires these controls.
- Do not pass the token of the client to a different API. Do not accept a token that a different service issued.
- Annotations are hints for the client. They do not replace permission checks on the server.
- A state handle is a name, not a permission. Check the access of the caller to the handle on each call.
- Do not mirror a secret into a header with `x-mcp-header`. Intermediaries can read headers.
- Treat the text that a tool returns from users or from the web as untrusted. It can contain instructions for the model.

## Common mistakes

- **One tool for each API endpoint.** Sixty tools with similar names make the model select the wrong one.
- **A description that says what and not when.** "Gets invoices" does not tell the model when to use a different tool.
- **Session state in the memory of the server.** The next request can arrive at a different instance.
- **An input error as a JSON-RPC error.** The client can hide it from the model. Use `isError: true`.
- **A server that answers only `initialize`.** A client of revision `2026-07-28` gets an error, and the scanner gives a partial result.
- **A `401` with no `WWW-Authenticate` header.** The client must guess where the metadata is, and the scanner gives a fail.
