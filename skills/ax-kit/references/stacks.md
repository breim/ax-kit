# Stacks: where each change goes

Read this file to find where a file, a header, or a route goes in the project. First detect the stack. Then use its section.

## Detect the stack

| Signal in the project | Stack |
|---|---|
| `next.config.*`, or `next` in `package.json` | Next.js |
| `astro.config.*` | Astro |
| `hono`, `elysia`, or `express` in `package.json` | Node or Bun HTTP framework |
| `wrangler.toml` or `wrangler.jsonc` | Cloudflare Workers |
| `fastapi` in `pyproject.toml` or `requirements.txt` | FastAPI |
| `manage.py` | Django |
| `Gemfile` with `rails` | Rails |
| `artisan` | Laravel |
| Only HTML files, or a static site generator | Static site |

A project can have two stacks, for example a Next.js site and a FastAPI service. Find which stack serves the URL that you change.

Also find the layer in front of the app. A CDN, a reverse proxy, or a hosting platform can add headers and can block requests.
Look for `vercel.json`, `netlify.toml`, `_headers`, `nginx.conf`, and `Caddyfile`.

## The four types of change

Most playbooks need one or more of these changes.

| Type | Examples |
|---|---|
| A static file | `llms.txt`, `robots.txt`, files below `/.well-known/` |
| A response header | `Link`, `Vary`, `Content-Signal` |
| A dynamic route | A Markdown version of a page, an API catalog built from code |
| Request handling | Content negotiation on `Accept`, error responses, the 404 response |

Prefer a generated file to a static file when the content comes from data that changes. A static `llms.txt` goes out of date.

## Next.js

- **Static file:** `public/`. A path below `public/.well-known/` works.
- **Generated file:** a route handler, for example `app/llms.txt/route.ts`. Use `app/robots.ts` and `app/sitemap.ts` for those two files.
- **Header:** the `headers()` function in `next.config.*`, or the response of a route handler.
- **Request handling:** `middleware.ts`. Next.js 16 names this file `proxy.ts`. Use a rewrite to send a request with `Accept: text/markdown` to a Markdown route.
- **404:** `app/not-found.tsx`. It returns status 404 for a missing route. Check that a dynamic route calls `notFound()` for missing data.
- **Rendering:** a Server Component puts its content in the first HTML. A component with `'use client'` that loads data in an effect does not.

## Astro

- **Static file:** `public/`.
- **Generated file:** an endpoint, for example `src/pages/llms.txt.ts` with a `GET` export.
- **Header:** the config of the host (`_headers`, `vercel.json`), or `src/middleware.ts` with a server adapter.
- **Request handling:** `src/middleware.ts`. It needs a server adapter. A static build cannot negotiate on `Accept`, so use `.md` URLs there.
- **Rendering:** Astro renders to HTML by default. An island with `client:only` has no content in the first HTML.

## Hono, Elysia, and Express

- **Static file:** the static middleware of the framework, or one route for each file.
- **Generated file and header:** a route handler.
- **Request handling:** a middleware before the routes. Read `Accept` there.
- **Errors:** one error handler for the app (`app.onError` in Hono and Elysia, an error middleware in Express). Put the RFC 9457 error format there.
- **404:** the not-found handler (`app.notFound` in Hono, the last middleware in Express). Return JSON for an API route.
- **OpenAPI:** generate it from the route schemas. Use `@hono/zod-openapi` for Hono and `@elysiajs/openapi` for Elysia.

## Cloudflare Workers

- **Static file:** the assets directory in the Wrangler config.
- **Generated file, header, request handling:** the `fetch` handler, or a framework on Workers.
- **Zone features:** a Cloudflare zone can convert HTML to Markdown and can manage `robots.txt`. These are dashboard settings, not code. Give the user the steps from the playbook.

## FastAPI

- **Static file:** a route that returns `PlainTextResponse` or `FileResponse`. A `StaticFiles` mount at `/` hides the API routes, so mount it on a path.
- **OpenAPI:** FastAPI serves it at `/openapi.json`. Improve it with `summary`, `description`, `response_model`, and `responses` on each route.
- **Header and request handling:** a middleware (`@app.middleware("http")`).
- **Errors:** exception handlers for `HTTPException` and `RequestValidationError`. Return `application/problem+json` there.

## Django

- **Static file:** a URL pattern with a `TemplateView` or a small view. Do not use the static files app for a file at the site root.
- **Header and request handling:** a middleware class.
- **Errors:** `handler404` and `handler500`. For Django REST Framework, use a custom `EXCEPTION_HANDLER`.
- **OpenAPI:** `drf-spectacular` generates it for Django REST Framework.

## Rails

- **Static file:** `public/`. Rails serves `public/robots.txt` and `public/llms.txt` directly.
- **Generated file:** a route and a controller action with `render plain:`.
- **Header and request handling:** a Rack middleware, or a `before_action`. Use `request.accepts` or a custom MIME type for Markdown.
- **Errors:** `rescue_from` in `ApplicationController`, or `config.exceptions_app`.

## Laravel

- **Static file:** `public/`.
- **Generated file:** a route in `routes/web.php`.
- **Header and request handling:** a middleware class.
- **Errors:** the exception handler in `bootstrap/app.php`. Return JSON when the request expects JSON.

## Static site

- **Static file:** the output root of the generator.
- **Header:** the config of the host. Use `_headers` for Netlify and Cloudflare Pages, `vercel.json` for Vercel, and `add_header` for nginx.
- **Request handling:** a static host cannot negotiate on `Accept`. Publish a `.md` file for each page, and link to it.
- **404:** configure the host to return status 404 with the custom page. A single-page fallback that returns 200 for each path is a soft 404.

## After the change

Run the app and request the new resource with `curl -i`. Check the status, the `Content-Type`, and the body.
Then run the scanner. A file that works locally can fail on production when a CDN or a proxy changes the response.
