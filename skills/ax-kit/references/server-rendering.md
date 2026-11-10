# Server rendering

- **Reviewed:** 2026-11
- **Pillar:** Read
- **Checks:** `read.content-without-js` (gate), `read.page-weight`
- **Template:** none

## Why agents need it

Most agents get a page with one HTTP request and read the HTML of the response. They do not run JavaScript.
If the HTML is an application shell, the agent gets an empty page. It does not see the product, the prices, or the documentation.
Some agents drive a browser and run the JavaScript. That method is slower, and not all agents have it.

`read.content-without-js` is a gate. If it fails, the AX Score cannot be higher than 59.

## Status of the standard

- No standard defines these two checks. The scanner measures the first HTML response, as an agent with no browser gets it.
- The limits of 200 and 600 visible characters, and of 1 MB, are rules of the scanner.
- Static generation, server rendering, and prerendering are stable features of the frameworks in the stack notes.

## Implement

### 1. Measure the first HTML response

Search the response for a sentence that the page shows in a browser:

```bash
curl -s https://<host>/pricing | grep -c 'Starter plan'
```

If the result is `0`, the sentence is not in the HTML. Then count the visible text with the scanner:

```bash
node <skill-dir>/scripts/ax.mjs scan https://<host>/pricing --json
```

The evidence of `read.content-without-js` gives the number of visible characters and the shell signals.
The scanner removes the comments and the `script`, `style`, `noscript`, `template`, and `svg` elements. Then it removes the tags and counts the characters.

| Visible characters | Shell signal | Result |
|---|---|---|
| 600 or more | Not used | Pass |
| 200 to 599 | Not used | Partial |
| Fewer than 200 | None | Partial |
| Fewer than 200 | One or more | Fail |

The scanner uses two shell signals:

- An empty mount element: a `<div>` with the id `root`, `app`, `__next`, `__nuxt`, or `svelte`, and with no content.
- A `<noscript>` message that contains "enable JavaScript" or "requires JavaScript".

An entry response that is not HTML passes, for example plain text or Markdown. An error page does not fail this check.

### 2. Select the pages and the rendering model

Put the content of each public page in the first HTML response: the home page, the pricing, the documentation, and the product pages.
A page behind a login can stay a client application. For those functions, give agents an API or an MCP server. See [mcp-server.md](mcp-server.md).

| Content of the page | Rendering model |
|---|---|
| The same for all users, and it changes at each deployment | Static generation (step 3) |
| The same for all users, and it changes between deployments | Server rendering (step 4) |
| An existing single-page application that cannot change its framework | Prerendering (step 5) |

### 3. Use static generation

- Build each page to an HTML file at build time.
- Get the list of pages from the content source, so that each new page gets a file.
- Use this model for documentation, marketing pages, and a blog.

### 4. Use server rendering

- Load the data of the page on the server, and put it in the HTML.
- Do not load the main content in the browser after the page starts.
- Do not send only a loading indicator from the server. The agent then reads the indicator, not the content.
- Keep the interactive parts as client code. Only the content must be in the HTML.

### 5. Prerender an existing single-page application

- Use the prerender option of the router or the framework, if it has one.
- If it has none, open each public route in a headless browser at build time, and save the HTML.
- Serve the saved HTML as the first response. The application then starts in the browser as before.
- Get the list of routes from the sitemap, so that the list stays complete.
- Serve the same HTML to all clients. Do not select the prerendered file by `User-Agent`.

### 6. Reduce the page weight

The scanner reads a maximum of 2 MB of each response, after decompression. It measures the HTML in bytes.

| HTML of the entry page | Result |
|---|---|
| 1 MB (1,048,576 bytes) or smaller | Pass |
| Larger than 1 MB, and not larger than 2 MB | Partial |
| Larger than 2 MB | Fail |

Compression does not change the result. To make the HTML smaller:

- Move the inline scripts and the inline styles to external files.
- Replace inline images (`data:` URLs) and large inline SVG with links to files.
- Reduce the serialized state that the framework puts in the page. Send only the fields that the page shows.
- Divide a long list into pages, and link each page to the next one.
- Remove content that is in the HTML two times, for example a desktop menu and a mobile menu.

## Stack notes

- **Next.js:** pages and layouts are Server Components by default. Next.js also prerenders Client Components to HTML for the first load. Content that a component loads in an effect is not in that HTML. Use `generateStaticParams` to build dynamic routes at build time.
- **Astro:** Astro renders a component to HTML by default. The `client:only` directive skips server rendering, so do not use it for the main content.
- **SvelteKit:** SvelteKit renders on the server by default. `export const ssr = false` gives an empty shell page. `export const prerender = true` builds the page at build time.
- **React Router:** set `prerender: true` in `react-router.config.ts` to prerender the static routes. With `ssr: false` and no `prerender`, the build is a single-page application.
- **A single-page application with no framework:** use step 5.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -s https://<host>/ | grep -c '<a sentence from the page>'
curl -s --compressed https://<host>/ | wc -c
node <skill-dir>/scripts/ax.mjs scan https://<host> --json
```

- `read.content-without-js` passes when the entry HTML has 600 visible characters or more.
- `read.page-weight` passes when the entry HTML is 1,048,576 bytes or smaller.

The scanner measures only the entry URL. Scan the pricing page and one documentation page too.

## Security notes

- Serve the same content to agents and to humans. Different content for a bot `User-Agent` is cloaking, and a `User-Agent` is not a verified identity.
- Do not put secrets in the serialized state. All the data that the server puts in the HTML is public.
- If a rendered page depends on the user, send `Cache-Control: private`. A shared cache must not give one user the page of a different user.
- If a prerender service opens URLs in a headless browser, limit it to the routes of the site. An open service can request internal addresses.

## Common mistakes

- **Server rendering on the home page only.** The pricing page and the documentation stay application shells.
- **A skeleton from the server.** The HTML has the layout and "Loading...", and JavaScript gets the content.
- **A redirect in JavaScript.** The entry page has no content and sends the browser to `/en/`. Use an HTTP redirect.
- **A consent wall in place of the content.** The first HTML has only the banner, and JavaScript adds the page after the click.
- **The content two times.** The page has the HTML and a JSON copy of the same data, and the weight doubles.
- **A test on a local build only.** A CDN or a proxy can change the response. Check the production URL.
