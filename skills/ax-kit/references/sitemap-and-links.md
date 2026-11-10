# Sitemap and Link headers

- **Reviewed:** 2026-11
- **Pillar:** Discover
- **Checks:** `discover.sitemap`, `discover.link-headers`
- **Template:** none

## Why agents need it

An agent reads the response headers before it reads the body. A `Link` header is the cheapest pointer to the resources that the agent needs.
A sitemap gives the full list of pages in one request, so the agent does not crawl.

## Status of the standard

- The sitemap protocol is stable. Its source is <https://www.sitemaps.org/protocol.html>.
- The `Link` header is stable. Its source is RFC 8288.
- The link relations for APIs are stable: `api-catalog` (RFC 9727), and `service-desc`, `service-doc`, `service-meta`, `status` (RFC 8631).
- `rel="alternate"` with `type="text/markdown"` is a convention for the Markdown version of a page. It has no specification of its own.

## Implement

### 1. Publish a sitemap

- Path: `/sitemap.xml`. Use a sitemap index if the site has more than 50,000 URLs.
- List only the canonical URL of each public page.
- Add `<lastmod>` with the real date of the last change. An agent uses it to skip pages that did not change.
- Generate the sitemap from the routes or the content source.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://acme.example/docs/quick-start</loc>
    <lastmod>2026-10-02</lastmod>
  </url>
</urlset>
```

### 2. Name the sitemap in robots.txt

```
Sitemap: https://acme.example/sitemap.xml
```

Use an absolute URL. The line can be at any place in the file.

### 3. Add Link headers to the entry page

Send only the relations that the site has. Each target must exist.

```http
Link: </.well-known/api-catalog>; rel="api-catalog",
      </openapi.json>; rel="service-desc"; type="application/openapi+json",
      </docs>; rel="service-doc",
      </llms.txt>; rel="describedby"; type="text/plain",
      </index.md>; rel="alternate"; type="text/markdown"
```

| Relation | Target |
|---|---|
| `api-catalog` | The API catalog. See [api-catalog.md](api-catalog.md). |
| `service-desc` | The machine-readable description of the API, for example the OpenAPI file |
| `service-doc` | The documentation for humans |
| `describedby` | A resource that describes this one, for example `llms.txt` |
| `alternate` with `type="text/markdown"` | The Markdown version of this page |

### 4. Add the Markdown alternate to each page

Each HTML page that has a Markdown version points to it, in the header or in the HTML:

```html
<link rel="alternate" type="text/markdown" href="/docs/quick-start.md">
```

## Stack notes

- **Next.js:** `app/sitemap.ts` generates the sitemap. Put the `Link` header in `headers()` of `next.config.*`.
- **Astro:** the `@astrojs/sitemap` integration generates the sitemap. Put headers in the config of the host.
- **Static hosts:** use the `_headers` file on Netlify and Cloudflare Pages, and `vercel.json` on Vercel.
- **nginx:** `add_header Link '</llms.txt>; rel="describedby"' always;` in the `location = /` block.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -sI https://<host>/ | grep -i '^link'
curl -s https://<host>/sitemap.xml | head -5
```

- `discover.sitemap` passes when a sitemap from `robots.txt` or at `/sitemap.xml` is valid XML with one `<loc>` or more.
- `discover.link-headers` passes when the entry response has a `Link` header with an agent relation from the table, or a Markdown alternate.

## Security notes

- Do not list private, staging, or parameter URLs in the sitemap.
- A `Link` header is public. Do not point to an internal API description.

## Common mistakes

- **A sitemap with stale URLs.** Each URL that returns 404 costs the agent one request.
- **`<lastmod>` set to the build time for all pages.** The agent then cannot tell which pages changed.
- **A `Link` header only on the home page of a different host.** Put the header on the host that the agent requests.
- **A relation with a target that does not exist.** Check each target with `curl`.
- **A CDN that removes the header.** Check the header on the production URL, not only locally.
