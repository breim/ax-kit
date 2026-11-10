# Markdown for agents

- **Reviewed:** 2026-11
- **Pillar:** Read
- **Checks:** group `read.markdown` = `read.markdown-negotiation`, `read.markdown-url`. Also `read.vary-accept` and `read.markdown-parity`.
- **Template:** none

## Why agents need it

An HTML page has navigation, scripts, styles, and markup around the content. An agent uses tokens for all of them.
A Markdown version has only the content. It keeps the headings, the lists, the tables, and the code blocks.

The group `read.markdown` passes when one of its two members passes. Content negotiation is the better of the two, because the agent uses the URL that it has.

## Status of the standard

- Content negotiation on the `Accept` header is stable. Its source is RFC 9110, section 12.
- The media type `text/markdown` is registered by RFC 7763. That RFC makes the `charset` parameter mandatory.
- The `.md` URLs are a part of the llms.txt proposal at <https://llmstxt.org/>. No standards body owns it.
- `rel="alternate"` with `type="text/markdown"` is a convention. It has no specification of its own.
- "Markdown for Agents" is a feature of a Cloudflare zone. Its source is the Cloudflare documentation, in step 5.

## Implement

### 1. Write the Markdown version

- Generate the Markdown from the same source as the HTML page. Two sources that people edit go out of sync.
- Include the main content only. Remove the navigation, the header, the footer, and the cookie banner.
- Start the content with one H1 that is the title of the page.
- Keep all the facts of the HTML page: the prices, the limits, the tables, and the code examples.
- Link to the Markdown version of other pages.

Front matter is optional. It is a convention, not a standard. Use it for the title, the description, and the URL of the page:

```markdown
---
title: Quick start
description: Create and send the first invoice.
url: https://acme.example/docs/quick-start
---

# Quick start

> Documentation index: https://acme.example/llms.txt
```

### 2. Negotiate on the Accept header

The agent requests the URL of the page and asks for Markdown:

```http
GET /docs/quick-start HTTP/1.1
Accept: text/markdown

HTTP/1.1 200 OK
Content-Type: text/markdown; charset=utf-8
Vary: Accept
```

- Return Markdown only when the `Accept` header names `text/markdown`.
- Return HTML for `Accept: */*` and for a request with no `Accept` header.
- Send `Vary: Accept` on the HTML response and on the Markdown response.
- Keep the status codes the same. If the page does not exist, return 404 for the two formats.

**A Node framework (Express).** `markdownFor` is the function of the project that returns the Markdown of a path, or `null`.
Keep `text/html` first in the list. `req.accepts` then returns `text/html` for `*/*`.

```js
app.use((req, res, next) => {
  res.vary('Accept');
  if (req.accepts(['text/html', 'text/markdown']) !== 'text/markdown') return next();
  const markdown = markdownFor(req.path);
  if (markdown === null) return next();
  res.type('text/markdown').send(markdown);
});
```

**Next.js.** The file is `proxy.ts`. Before Next.js 16, its name was `middleware.ts` and the function was `middleware`.

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const accept = request.headers.get('accept') ?? ''
  if (!accept.includes('text/markdown')) return NextResponse.next()
  return NextResponse.rewrite(new URL(`/markdown${request.nextUrl.pathname}`, request.url))
}

export const config = { matcher: '/docs/:path*' }
```

The route handler `app/markdown/[[...path]]/route.ts` returns the Markdown. `getMarkdown` is the function of the project.

```ts
export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  const markdown = await getMarkdown(path)
  if (markdown === null) return new Response('Not found', { status: 404 })
  return new Response(markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', Vary: 'Accept' } })
}
```

Add `Vary: Accept` to the HTML pages too, for example in `headers()` of `next.config.*`. Then check the header with `curl`.

### 3. Publish a Markdown file at a .md URL

llmstxt.org gives two rules. A static site can obey them with no server code.

- Append `.md` to the URL of the page, or replace the extension with `.md`.
- For a URL with no file name, append `index.html.md` or `index.md`.

The scanner requests a maximum of two URLs for the entry page. For `/`, it requests `/index.md`, then `/index.html.md`.
For `/docs/quick-start` or `/docs/quick-start/`, it requests `/docs/quick-start.md`, then `/docs/quick-start/index.md`.

### 4. Point to the Markdown version

Put this element in the `<head>` of each HTML page that has a Markdown version:

```html
<link rel="alternate" type="text/markdown" href="/docs/quick-start.md">
```

Use the Markdown URLs in `llms.txt` too. See [llms-txt.md](llms-txt.md) and [sitemap-and-links.md](sitemap-and-links.md).

### 5. Use the Cloudflare zone feature (optional)

If the site is on a Cloudflare zone, the zone can do step 2 with no code. The documentation at <https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/> states these facts:

- The zone converts the HTML to Markdown when the `Accept` header of the request has `text/markdown`.
- The feature is available to the Pro, Business, and Enterprise plans, and to SSL for SaaS customers, at no cost.
- To enable it, select the zone in the dashboard. Go to **Agent Readiness** > **Markdown for Agents**. A Configuration Rule can enable it for one host or one path.
- The response has `Content-Type: text/markdown; charset=utf-8`, and its `Vary` header includes `Accept`.
- The conversion removes the headers, the footers, the navigation, the scripts, and the styles.
- When the page has the related `<meta>` tags, the conversion adds YAML front matter with `title`, `description`, and `image`.
- The zone converts only HTML, and only a maximum of 6 MiB of decompressed HTML.
- If the origin sends no `Content-Signal` header, the zone adds `Content-Signal: ai-train=yes, search=yes, ai-input=yes`.

The default value has `ai-train=yes`. If the owner has a different policy, send a `Content-Signal` header from the origin. See [bot-access.md](bot-access.md).
The documentation describes content negotiation only. For `.md` URLs, use step 3.

## Stack notes

- **Next.js:** `proxy.ts` and a route handler, as in step 2. A static export has no proxy, so publish `.md` files there.
- **Astro:** a static build cannot negotiate on `Accept`. Generate one `.md` file for each page with an endpoint.
- **Static host:** publish the `.md` files. Check that the host serves them as `text/markdown` or `text/plain`, and not as a download.
- **Documentation platforms:** many platforms publish a Markdown version of each page. Check the output before you add a second one.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -si -H 'Accept: text/markdown' https://<host>/ | head -20
curl -si https://<host>/ | grep -i -E '^(content-type|vary):'
curl -si https://<host>/index.md | head -20
```

- `read.markdown-negotiation` passes when the first response has status 200, `Content-Type: text/markdown`, and a body that is not HTML.
- `read.markdown-url` passes when one of the two `.md` URLs returns status 200 and a body that is not HTML.
- For the two checks, an empty body is a failure, and a response with an HTML `Content-Type` is HTML.
- `read.vary-accept` passes when the `Vary` header of the Markdown response contains `Accept`.
- `read.markdown-parity` passes when the Markdown has 50% or more of the length of the visible HTML text. It fails below 25%.
- The second command must show `text/html`. If it shows `text/markdown`, a browser gets Markdown.

## Security notes

- Give the same content in the Markdown and in the HTML. Different content for agents is cloaking, and agents lose trust in the site.
- Do not put text in the Markdown that the HTML page hides. An agent reads hidden instructions as an attack.
- Apply the same access control to the two formats. A Markdown route must not show a draft, or content that the HTML page keeps behind a login.
- If a response depends on the user, send `Cache-Control: private`. `Vary: Accept` does not separate users.

## Common mistakes

- **Markdown for `*/*`.** A browser or a plain `curl` request then gets Markdown.
- **The wrong `Content-Type`.** The negotiated response has `text/plain` or `text/html`, and the check fails.
- **A soft 404.** The server returns the HTML app shell with status 200 for `/index.md`.
- **No `Vary: Accept` behind a CDN.** The cache stores one format and gives it to all clients.
- **A stub.** The Markdown has only a title and a link, and the agent does not know that the HTML has more.
- **The full page in Markdown.** A converter that keeps the menus and the footer gives the agent no benefit.
