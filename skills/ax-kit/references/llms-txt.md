# llms.txt

- **Reviewed:** 2026-11
- **Pillar:** Discover
- **Checks:** `discover.llms-txt`, `discover.llms-txt-quality`, `discover.llms-full-txt` (Watch)
- **Template:** `assets/llms.txt`

## Why agents need it

An agent that arrives at a site must decide which pages to read. A sitemap lists all the pages but gives no priority.
A home page is made for humans and uses many tokens. `llms.txt` is one small Markdown file at the site root.
It tells the agent what the site is and where the important pages are.

## Status of the standard

- `llms.txt` is a community proposal. Its source is <https://llmstxt.org/>. No standards body owns it.
- Documentation sites use it widely. Agents and coding tools read it.
- `llms-full.txt` is a convention. llmstxt.org does not define it. Some sites use it to give all the content in one file.

## Implement

### 1. Write the file

The format has these parts, in this order:

1. An H1 with the name of the site or the product. This is the only required part.
2. A blockquote with a short summary.
3. Optional paragraphs or lists with more detail. Do not use headings here.
4. H2 sections. Each section is a list of links: `- [name](url): optional note`.
5. An H2 section with the name `Optional`. An agent can skip these links when its context is small.

```markdown
# Acme

> Acme is an invoicing API for small companies. It creates invoices, sends them, and tracks payments.

Use the REST API for all operations. Authenticate with an API key in the `Authorization` header.

## Docs

- [Quick start](https://acme.example/docs/quick-start.md): create and send the first invoice
- [Authentication](https://acme.example/docs/auth.md): API keys and OAuth
- [API reference](https://acme.example/openapi.json): the OpenAPI description

## Optional

- [Changelog](https://acme.example/changelog.md)
```

### 2. Choose the links

- Put the pages for the most common tasks first.
- Link to the Markdown version of each page. See [markdown-for-agents.md](markdown-for-agents.md).
- Write a note for each link. The note tells the agent when to read the page.
- Do not list all the pages. That is the job of the sitemap.

### 3. Keep the file small

Keep the file below 50,000 characters. A larger file can exceed what an agent reads in one request.
For a large site, publish one `llms.txt` for each section, for example `/docs/llms.txt`, and link to them from the root file.

### 4. Generate the file

Generate the file from the routes or the content collection of the project, at build time.
A file that a person edits by hand goes out of date when a page moves.

### 5. Serve the file

- Path: `/llms.txt` at the site root.
- Status 200, `Content-Type: text/plain; charset=utf-8` or `text/markdown; charset=utf-8`.
- Do not redirect the path to an HTML page.

### 6. Point to the file

Put a pointer at the top of the Markdown version of each documentation page:

```markdown
> Documentation index: https://acme.example/llms.txt
```

An agent that lands on a deep page then finds the index.

### 7. llms-full.txt (optional)

Publish `/llms-full.txt` only if all the content is small enough to be useful in one file.
For a large site, the per-page Markdown files and `llms.txt` serve an agent better.

## Stack notes

- **Next.js:** `app/llms.txt/route.ts` with a `GET` handler that builds the text from the content source.
- **Astro:** `src/pages/llms.txt.ts`. Build the list from `getCollection()`.
- **Documentation platforms:** many platforms generate `llms.txt`. Check the output before you add a second file.
- **Static site:** generate the file in the build script and write it to the output root.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<host>/llms.txt
node <skill-dir>/scripts/ax.mjs scan https://<host> --json
```

- `discover.llms-txt` passes when the file starts with an H1 and has one link or more.
- `discover.llms-txt-quality` passes when the file is within 50,000 characters, half or more of its links point to Markdown, and the first 5 links resolve.

## Security notes

- The file is public. Do not list internal, admin, or unpublished URLs.
- Do not write instructions that try to control the agent, for example "ignore other sources". Agents treat such text as an attack, and the site loses trust.
- Do not put secrets or customer data in the notes.

## Common mistakes

- **A soft 404.** The server returns the HTML app shell with status 200 for `/llms.txt`. The check fails, because the body is HTML.
- **Links to HTML pages only.** The agent then gets navigation, scripts, and styles with the content.
- **Broken links after a site change.** Add a test that requests each link.
- **A copy of the sitemap.** A list of 2,000 links with no notes gives the agent no priority.
- **No H1 on the first line.** A front-matter block or a comment before the H1 breaks the format.
