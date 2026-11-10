import { API_PROFILES } from '../model.mjs';

const judged = (check) => ({ stability: 'stable', evidence: 'judged', profiles: API_PROFILES, ...check });

export const reviewChecks = [
  judged({
    id: 'act.mcp-tools',
    title: 'The MCP tools are easy for a model to select and call',
    why: 'A model selects a tool only from its name, its description, and its schema. No human is there to explain a tool.',
    tier: 'recommended',
    spec: 'https://modelcontextprotocol.io/specification/2026-07-28/server/tools',
    playbook: 'mcp-server',
    rubric: {
      pass: 'Each tool has a clear name, a description that says when to use it, and a typed input schema with a description for each parameter. Each tool has annotations for read-only and destructive behaviour. The server has a small set of tools that match user tasks.',
      partial: 'The tools have names and typed schemas. But some descriptions do not say when to use the tool, some parameters have no description, or the annotations are absent.',
      fail: 'The product has no MCP server. Or the tools have no description or no typed input schema. Or the server has too many tools for a model to select the correct one.',
      evidence: 'Call `tools/list` on the MCP server. Record the number of tools. For each tool, record the name, the description, the `inputSchema`, and the annotations `readOnlyHint` and `destructiveHint`.',
    },
  }),
  judged({
    id: 'act.safe-retries',
    title: 'An agent can retry a write with no duplicate effect',
    why: 'An agent retries after a timeout. If the first request succeeded, a retry with no protection creates a second order or a second payment.',
    tier: 'recommended',
    spec: 'https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/',
    playbook: 'api-design',
    rubric: {
      pass: 'Each write operation that is not idempotent accepts an `Idempotency-Key` header. The documentation states how long the server keeps a key and what a repeated key returns. The other write operations are idempotent, for example `PUT` and `DELETE`.',
      partial: 'Some write operations accept an idempotency key and others do not. Or the header exists, but the documentation does not state the behaviour for a repeated key.',
      fail: 'A `POST` operation that creates a resource or moves money accepts no idempotency key, so a retry after a timeout can create a duplicate.',
      evidence: 'Read the API description and the documentation. Find the `POST` and `PATCH` operations that create or change resources. Record which of them accept an `Idempotency-Key` header, and the documented behaviour for a repeated key.',
    },
  }),
  judged({
    id: 'act.pagination',
    title: 'List operations have cursor pagination with a documented limit',
    why: 'An agent must get all the items of a list with no gaps and no duplicates, and it cannot see a "next page" button.',
    tier: 'optional',
    playbook: 'api-design',
    rubric: {
      pass: 'Each list operation uses cursor pagination and has a `limit` parameter with a documented default and maximum. The response gives the cursor of the next page. The order of the items is stable and documented.',
      partial: 'The list operations have pagination, but they use page numbers or offsets, or the limit or the order has no documentation.',
      fail: 'A list operation returns all the items in one response. Or it returns a part of the items and gives no method to get the others.',
      evidence: 'Find the operations that return an array. Record the pagination parameters, the default limit and the maximum limit, the response field for the next cursor, and the documented order.',
    },
  }),
  judged({
    id: 'act.cli-or-sdk',
    title: 'A CLI or an SDK lets an agent act with no browser',
    why: 'An agent in a terminal completes a task faster with one command than with HTTP requests that it builds from the documentation.',
    tier: 'optional',
    playbook: 'api-design',
    rubric: {
      pass: 'The product has an official CLI with a non-interactive mode and JSON output, or an official SDK. The documentation shows how to authenticate with no browser.',
      partial: 'A CLI or an SDK exists, but the CLI needs interactive prompts or a browser login, or it has no machine-readable output.',
      fail: 'The product has no CLI and no SDK, so an agent must build each HTTP request from the documentation or use the web interface.',
      evidence: 'Read the documentation and the package registries for an official CLI or SDK. Record the flags for non-interactive use and for JSON output, and the authentication method.',
    },
  }),
];
