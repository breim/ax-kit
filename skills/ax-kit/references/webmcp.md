# WebMCP

- **Reviewed:** 2026-11
- **Pillar:** Act
- **Checks:** `act.webmcp` (Watch)
- **Template:** none

## Why agents need it

A browser agent uses a page for a person. With no help from the page, it reads the DOM and simulates clicks and key presses.
That method is slow, and it fails when the layout changes.

With WebMCP, the page declares its functions as tools with a name, a description, and an input schema. The agent calls a tool directly.

## Status of the standard

- WebMCP is a proposed web standard. Its draft is a Draft Community Group Report of the W3C Web Machine Learning Community Group.
- The draft is not a W3C Standard, and it is not on the W3C Standards Track.
- The draft defines the imperative API. The repository of the group says that the declarative form API is not part of the specification at this time.
- Chrome has an origin trial from version 149. The Chrome documentation describes the two APIs.
- The implementation status file of the group also lists an origin trial in Edge 150. It lists no implementation for Firefox or Safari.
- The scanner reports this check in the Watch bucket. It does not change the AX Score.

Sources: <https://webmachinelearning.github.io/webmcp/> and <https://developer.chrome.com/docs/ai/webmcp>.

### When it is worth the work

- Adopt it when users do tasks in your web app through a browser agent. Examples are a search, a booking, and a form.
- Adopt it when the app already has one function for each task. A tool then calls that function.
- Do not use it as the only interface for agents. An agent with no browser cannot call a WebMCP tool.
- Give an API with an OpenAPI file or an MCP server a higher priority. Read [openapi-quality.md](openapi-quality.md) and [mcp-server.md](mcp-server.md).

## Implement

### 1. Enable the feature

- For local work in Chrome, open `chrome://flags/#enable-webmcp-testing`, enable the flag, and start Chrome again.
- For real users, register the origin for the origin trial. The link is on the Chrome documentation page.
- Put the trial token in each page, as a `meta` element or as an `Origin-Trial` response header.

```html
<meta http-equiv="origin-trial" content="<token>">
```

A token is valid for one origin, and it has an expiry date.

### 2. Declare a tool on a form

Add `toolname` and `tooldescription` to the `<form>` element. The browser builds the input schema from the fields of the form.

```html
<form action="/search" toolname="search_products"
      tooldescription="Search the product catalog by keyword. Use it when the user wants to find a product.">
  <label for="q">Keyword</label>
  <input id="q" name="q" type="text" required
         toolparamdescription="One or more words from the name of the product">
  <button type="submit">Search</button>
</form>
```

- If you remove `toolname` or `tooldescription`, the browser removes the tool.
- Give each field a `name`. The name is the property name in the schema.
- `toolparamdescription` sets the description of a parameter. With no such attribute, the browser uses the text of the label.
- With no `toolautosubmit` attribute, the browser fills the form, and the user clicks the submit button.
- With `toolautosubmit`, the browser submits the form when the agent calls the tool. Use it only for a safe action, for example a search.

To return a result to the agent with no page navigation, handle the `submit` event:

```js
form.addEventListener('submit', (event) => {
  if (!event.agentInvoked) return;
  event.preventDefault();
  event.respondWith(runSearch(new FormData(form)));
});
```

`runSearch` returns a promise. The browser gives the value of the promise to the agent as the tool result.

### 3. Register a tool with JavaScript

Use the imperative API for an action that has no form. The API object is `document.modelContext`. Do not use `navigator.modelContext`.

```js
if ('modelContext' in document) {
  const controller = new AbortController();
  await document.modelContext.registerTool(
    {
      name: 'add_to_cart',
      description: 'Add one product to the cart of the user. Use it after the user selects a product.',
      inputSchema: {
        type: 'object',
        properties: {
          sku: { type: 'string', description: 'The SKU of the product' },
          quantity: { type: 'integer', minimum: 1, description: 'The number of items' },
        },
        required: ['sku'],
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: async ({ sku, quantity = 1 }, { signal }) => {
        const cart = await addToCart(sku, quantity, { signal });
        return `The cart has ${cart.count} items.`;
      },
    },
    { signal: controller.signal },
  );
}
```

- The API requires `name`, `description`, and `execute`.
- `execute` gets the input object and an `AbortSignal`. It returns a promise.
- To remove the tool, call `controller.abort()`. Remove a tool when the page state makes it unusable.

### 4. Set the annotations

| Annotation | Set it to `true` when |
|---|---|
| `readOnlyHint` | The tool changes no state |
| `consequentialHint` | The action has an important effect or the user cannot reverse it, for example a payment |
| `untrustedContentHint` | The result contains text from users or from external sources |

Each annotation is `false` by default. These names are different from the tool annotations of MCP.

### 5. Keep the tool and the interface the same

- Call the same application function from the tool and from the user interface. Then validation and permissions are the same.
- Update the interface after the tool completes. Return success only when the state of the app matches the result.
- Return an error text that says how to correct the call.

## Stack notes

- **Server-rendered forms:** add the attributes in the template. The scanner finds them in the entry HTML.
- **React and other component frameworks:** register the tool in an effect, and abort the controller in the cleanup function.
- **Bundled scripts:** the scanner reads only the entry HTML. It does not see a tool that an external script registers.
- **Iframes:** tool registration is off in a cross-origin iframe. The parent page enables it with `allow="tools"`.

For other stacks, read [stacks.md](stacks.md).

## Verify

Run this in the console of a browser that has the feature enabled:

```js
await document.modelContext.getTools();
```

The result lists the tools of the page with their names, descriptions, and input schemas.

```bash
node <skill-dir>/scripts/ax.mjs scan https://<host> --profile webapp --json
```

- `act.webmcp` passes when the entry HTML has a `<form>` with `toolname` and `tooldescription`.
- `act.webmcp` also passes when an inline script in the entry HTML calls `modelContext.registerTool`.
- The check is static. A tool from an external script gives a fail in the scanner, although the tool exists in the browser.

## Security notes

- A tool runs in the page, so it acts with the session of the user. Treat the tool input as untrusted, like a request from the network.
- Validate the input in the code of the tool. A schema is a hint for the agent, and it does not enforce a constraint.
- For a payment, a deletion, or a message to other people, set `consequentialHint: true` and do not use `toolautosubmit`.
- Set `untrustedContentHint: true` on a tool that returns user content. That text can contain instructions for the agent.
- Write a description that matches the effect of the tool. A tool with the name "finalize cart" must not complete a purchase.
- Do not ask for personal data in the input schema that the task does not need.
- Tools are visible only to the same origin by default. Use the `exposedTo` option only for origins that you trust.
- To turn the feature off for a page, send the response header `Permissions-Policy: tools=()`.

## Common mistakes

- **`navigator.modelContext` in the code.** The API object is `document.modelContext`.
- **Only one of the two form attributes.** The browser registers no tool, and the check fails.
- **`toolautosubmit` on a form that buys or deletes.** The agent then completes the action with no click of the user.
- **Two tools that do almost the same.** The agent cannot select the correct one.
- **A tool result that says "done" when the interface shows a different state.** The user and the agent then disagree.
- **WebMCP as the only agent interface.** Agents that run with no browser get nothing.
